/* The audio-thread processor, as source. It is compiled by `audioWorklet
   .addModule()` from a Blob rather than fetched as a file, so the click never
   depends on a request landing.

   It schedules clicks against an anchor — one (tick, time) pair — instead of
   counting elapsed time, so a tempo, subdivision or swing change re-bases the
   grid without the beat ever drifting from where the listener last heard it. */

export const WORKLET_SRC = `
class ClickProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.running = false;
    this.bpm = 100;
    this.sub = 1;
    this.swing = 0.5;
    this.pattern = ['accent', 'normal', 'normal', 'normal'];
    this.pendingPattern = null;
    this.anchor = { tick: 0, time: 0 };
    this.nextTick = 0;
    this.startTick = 0;
    this.vol = 0.8;
    this.queue = [];
    this.vi = 0;
    this.voices = [];
    for (let i = 0; i < 8; i++) {
      this.voices.push({ a: false, f: 880, g: 0, d: 0.03, t: 0 });
    }
    this.cfg = {
      accent: { f: 1760, g: 1.0, d: 0.04 },
      minor: { f: 1173, g: 0.82, d: 0.038 },
      normal: { f: 880, g: 0.7, d: 0.035 },
      sub: { f: 1320, g: 0.35, d: 0.02 },
    };
    this.port.onmessage = (e) => this.onMsg(e.data);
  }

  /* Seconds per tick. */
  spt() {
    return 60 / this.bpm / this.sub;
  }

  /* Ticks run in pairs, and swing moves the second of each pair. */
  timeAtTick(k) {
    const s = this.spt();
    const p = Math.floor(k / 2);
    const q = k - 2 * p;
    const offset = q === 0 ? 0 : this.swing * 2 * s;
    return this.anchor.time + (2 * p - this.anchor.tick) * s + offset;
  }

  onMsg(m) {
    if (m.type === 'start') {
      this.anchor = m.anchor;
      this.bpm = m.bpm;
      this.sub = m.subdivision;
      this.swing = m.swing / 100;
      this.pattern = m.pattern;
      this.nextTick = m.anchor.tick;
      this.startTick = m.anchor.tick;
      this.pendingPattern = null;
      this.queue.length = 0;
      this.running = true;
    } else if (m.type === 'stop') {
      this.running = false;
      this.queue.length = 0;
      for (const v of this.voices) v.a = false;
    } else if (m.type === 'reanchor') {
      this.queue.push(m);
      this.queue.sort((a, b) => a.applyAtTime - b.applyAtTime);
    } else if (m.type === 'pattern') {
      if (this.running) this.pendingPattern = m.pattern;
      else this.pattern = m.pattern;
    } else if (m.type === 'volume') {
      this.vol = m.value;
    }
  }

  /* A click is a decaying sine. Its length is capped to the shortest gap the
     current grid produces, so a fast subdivision — or a hard swing, whose
     short half is much shorter than half a beat — never smears into the next
     click. */
  trigger(voice, off) {
    const c = this.cfg[voice];
    const s = this.spt();
    const shortest =
      this.sub > 1 ? Math.min(this.swing, 1 - this.swing) * 2 * s : s;
    const v = this.voices[this.vi];
    this.vi = (this.vi + 1) % 8;
    v.a = true;
    v.f = c.f;
    v.g = c.g;
    v.d = Math.min(c.d, 0.6 * shortest);
    v.t = -off / sampleRate;
  }

  process(inputs, outputs) {
    const out = outputs[0][0];
    const n = out.length;
    const dt = 1 / sampleRate;
    const t0 = currentTime;
    const tEnd = t0 + n * dt;
    out.fill(0);

    if (this.running) {
      while (this.queue.length && this.queue[0].applyAtTime <= tEnd) {
        const m = this.queue.shift();
        this.anchor = m.anchor;
        this.bpm = m.bpm;
        this.sub = m.subdivision;
        this.swing = m.swing / 100;
        this.nextTick = m.anchor.tick;
      }

      let guard = 0;
      while (guard++ < 600) {
        const tk = this.nextTick;
        const tt = this.timeAtTick(tk);
        if (tt >= tEnd) break;

        const bc0 = this.pattern.length;
        const span0 = bc0 * this.sub;
        /* Re-accenting a beat keeps the bar the same shape, so it lands on the
           next tick. Changing the count re-indexes every beat under a listener
           already inside the bar, so that one still waits for the downbeat. */
        const atDownbeat = tk >= 0 && (((tk % span0) + span0) % span0) === 0;
        if (
          this.pendingPattern &&
          (this.pendingPattern.length === bc0 || atDownbeat)
        ) {
          this.pattern = this.pendingPattern;
          this.pendingPattern = null;
        }

        const bc = this.pattern.length;
        const span = bc * this.sub;
        const mod = ((tk % span) + span) % span;
        const bi = Math.floor(mod / this.sub);
        const si = mod % this.sub;
        const st = this.pattern[bi];
        const off = Math.max(0, Math.round((tt - t0) * sampleRate));

        if (tk < 0) {
          /* Count-in: one click a beat, the first of them accented. */
          if ((tk - this.startTick) % this.sub === 0) {
            this.trigger(tk === this.startTick ? 'accent' : 'normal', off);
          }
        } else if (st !== 'muted') {
          const beatVoice =
            st === 'accent' ? 'accent' : st === 'minor' ? 'minor' : 'normal';
          this.trigger(si === 0 ? beatVoice : 'sub', off);
        }
        this.nextTick++;
      }
    }

    for (const v of this.voices) {
      if (!v.a) continue;
      const life = v.d * 5;
      for (let i = 0; i < n; i++) {
        const tt = v.t + i * dt;
        if (tt < 0) continue;
        if (tt > life) break;
        /* Exponential decay, with a sub-millisecond fade in so the attack does
           not start on a step. */
        const env = Math.exp(-tt / (v.d / 3)) * Math.min(1, tt / 0.0008);
        out[i] += Math.sin(2 * Math.PI * v.f * tt) * v.g * env;
      }
      v.t += n * dt;
      if (v.t > life) v.a = false;
    }

    for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i] * this.vol);
    return true;
  }
}
registerProcessor('click-processor', ClickProcessor);
`;
