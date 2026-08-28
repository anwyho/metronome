/* Metronome core — pure timing/pattern logic + the AudioWorklet engine.
   Loaded as a classic script; exposes window.MetronomeCore. */
(function () {
  const WORKLET_SRC = `
class ClickProcessor extends AudioWorkletProcessor {
  constructor(){
    super();
    this.running=false; this.bpm=100; this.sub=1; this.swing=0.5;
    this.pattern=['accent','normal','normal','normal'];
    this.pendingPattern=null; this.anchor={tick:0,time:0}; this.nextTick=0;
    this.vol=0.8; this.queue=[]; this.vi=0; this.voices=[];
    for(let i=0;i<8;i++) this.voices.push({a:false,f:880,g:0,d:0.03,t:0});
    this.cfg={accent:{f:1760,g:1.0,d:0.040},minor:{f:1173,g:0.82,d:0.038},normal:{f:880,g:0.7,d:0.035},sub:{f:1320,g:0.35,d:0.020}};
    this.port.onmessage=(e)=>this.onMsg(e.data);
  }
  spt(){ return (60/this.bpm)/this.sub; }
  timeAtTick(k){
    const s=this.spt(), p=Math.floor(k/2), q=k-2*p;
    return this.anchor.time + (2*p - this.anchor.tick)*s + (q===0?0:this.swing*2*s);
  }
  onMsg(m){
    if(m.type==='start'){
      this.anchor=m.anchor; this.bpm=m.bpm; this.sub=m.subdivision; this.swing=m.swing/100;
      this.pattern=m.pattern; this.nextTick=m.anchor.tick; this.pendingPattern=null; this.startTick=m.anchor.tick;
      this.queue.length=0; this.running=true;
    } else if(m.type==='stop'){
      this.running=false; this.queue.length=0;
      for(const v of this.voices) v.a=false;
    } else if(m.type==='reanchor'){
      this.queue.push(m); this.queue.sort((a,b)=>a.applyAtTime-b.applyAtTime);
    } else if(m.type==='pattern'){
      if(this.running) this.pendingPattern=m.pattern; else this.pattern=m.pattern;
    } else if(m.type==='volume'){ this.vol=m.value; }
  }
  trigger(voice, off){
    const c=this.cfg[voice], s=this.spt();
    const shortest=(this.sub>1) ? Math.min(this.swing,1-this.swing)*2*s : s;
    const v=this.voices[this.vi]; this.vi=(this.vi+1)%8;
    v.a=true; v.f=c.f; v.g=c.g; v.d=Math.min(c.d, 0.6*shortest); v.t=-off/sampleRate;
  }
  process(inputs, outputs){
    const out=outputs[0][0], n=out.length, dt=1/sampleRate, t0=currentTime, tEnd=t0+n*dt;
    out.fill(0);
    if(this.running){
      while(this.queue.length && this.queue[0].applyAtTime <= tEnd){
        const m=this.queue.shift();
        this.anchor=m.anchor; this.bpm=m.bpm; this.sub=m.subdivision; this.swing=m.swing/100;
        this.nextTick=m.anchor.tick;
      }
      let guard=0;
      while(guard++ < 600){
        const tk=this.nextTick, tt=this.timeAtTick(tk);
        if(tt >= tEnd) break;
        const bc0=this.pattern.length, span0=bc0*this.sub;
        if(this.pendingPattern && tk>=0 && (((tk % span0)+span0)%span0)===0){
          this.pattern=this.pendingPattern; this.pendingPattern=null;
        }
        const bc=this.pattern.length, span=bc*this.sub;
        const mod=((tk % span)+span)%span;
        const bi=Math.floor(mod/this.sub), si=mod % this.sub, st=this.pattern[bi];
        const off=Math.max(0,Math.round((tt-t0)*sampleRate));
        if(tk<0){
          if(((tk - this.startTick) % this.sub) === 0) this.trigger(tk===this.startTick?'accent':'normal', off);
        } else if(st!=='muted'){
          this.trigger(si===0 ? (st==='accent'?'accent':st==='minor'?'minor':'normal') : 'sub', off);
        }
        this.nextTick++;
      }
    }
    for(const v of this.voices){
      if(!v.a) continue;
      const life=v.d*5;
      for(let i=0;i<n;i++){
        const tt=v.t + i*dt;
        if(tt<0) continue;
        if(tt>life) break;
        const env=Math.exp(-tt/(v.d/3)) * Math.min(1, tt/0.0008);
        out[i]+= Math.sin(2*Math.PI*v.f*tt)*v.g*env;
      }
      v.t += n*dt;
      if(v.t > life) v.a=false;
    }
    for(let i=0;i<n;i++) out[i]=Math.tanh(out[i]*this.vol);
    return true;
  }
}
registerProcessor('click-processor', ClickProcessor);
`;

  const SUBS = [1, 2, 3, 4, 5, 6, 7, 8];
  const GLYPH = { accent: "X", minor: "x", normal: "o", muted: "." };
  const LEVELS = ["accent", "minor", "normal", "muted"];
  const CYCLE = ["muted", "normal", "minor", "accent"];
  const LEVEL_NAME = {
    accent: "major accent",
    minor: "minor accent",
    normal: "beat",
    muted: "silent",
  };
  const PRESETS = [
    ["Straight", 50],
    ["Light", 55],
    ["Medium", 60],
    ["Swing", 67],
    ["Hard", 75],
  ];
  const MARKS = [
    [60, "Largo"],
    [76, "Adagio"],
    [108, "Andante"],
    [120, "Moderato"],
    [168, "Allegro"],
    [Infinity, "Presto"],
  ];
  const PICTO = {};
  SUBS.forEach((n) => {
    PICTO[n] = n <= 4 ? "\u25CF".repeat(n) : "\u25CF\u00D7" + n;
  });
  /* swing splits a tick PAIR long-short, so it only means anything when the
     clicks per beat divide into pairs — even subdivisions. §3.4 */
  const swingApplies = (sub) => sub >= 2 && sub % 2 === 0;
  const clock = (sec) =>
    Math.floor(sec / 60) + ":" + String(Math.floor(sec % 60)).padStart(2, "0");

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function tempoMarking(bpm) {
    for (const [hi, name] of MARKS) if (bpm < hi) return name;
    return "Presto";
  }

  function parseGrouping(input) {
    const parts = String(input)
      .split("+")
      .map((s) => s.trim());
    if (!parts.length || parts.some((p) => !/^[0-9]+$/.test(p))) return null;
    const nums = parts.map(Number);
    if (nums.some((n) => n < 1)) return null;
    const sum = nums.reduce((a, b) => a + b, 0);
    if (sum < 2 || sum > 30) return null;
    const out = [];
    for (const n of nums) {
      out.push("accent");
      for (let i = 1; i < n; i++) out.push("normal");
    }
    return out;
  }

  /* Rolling mean of the last 4 intervals, outlier-guarded. §1.5.1 */
  function tapTempo(ts) {
    if (ts.length < 2) return null;
    let buf = [];
    for (let i = 1; i < ts.length; i++) {
      const d = ts[i] - ts[i - 1];
      const mean = buf.length
        ? buf.reduce((a, b) => a + b, 0) / buf.length
        : null;
      if (d > (mean === null ? 2000 : Math.min(2000, 2.5 * mean))) {
        buf = [];
        continue;
      }
      if (mean !== null && Math.abs(d - mean) / mean > 0.4) continue;
      buf.push(d);
      if (buf.length > 4) buf.shift();
    }
    if (!buf.length) return null;
    return clamp(
      Math.round(60000 / (buf.reduce((a, b) => a + b, 0) / buf.length)),
      20,
      300,
    );
  }

  /* Never throws. §1.6.3 */
  function parseHash(hash) {
    const out = {
      bpm: 100,
      beats: ["accent", "normal", "normal", "normal"],
      sub: 1,
      swing: 50,
    };
    const raw = String(hash || "").replace(/^#/, "");
    if (!raw) return out;
    const kv = {};
    for (const part of raw.split("&")) {
      const i = part.indexOf("=");
      if (i < 1) continue;
      try {
        kv[decodeURIComponent(part.slice(0, i)).toLowerCase()] =
          decodeURIComponent(part.slice(i + 1));
      } catch (e) {}
    }
    if (kv.bpm !== undefined) {
      const n = parseFloat(kv.bpm);
      if (Number.isFinite(n)) out.bpm = clamp(Math.round(n), 20, 300);
    }
    if (kv.groups !== undefined) {
      const g = parseGrouping(kv.groups);
      if (g) out.beats = g;
    }
    if (kv.beats !== undefined) {
      const s = kv.beats;
      if (s.length && /^[XxOo.]+$/.test(s)) {
        let b = s
          .split("")
          .map((c) =>
            c === "X"
              ? "accent"
              : c === "x"
                ? "minor"
                : c === "."
                  ? "muted"
                  : "normal",
          );
        if (b.length > 30) b = b.slice(0, 30);
        while (b.length < 2) b.push("normal");
        out.beats = b;
      }
    }
    if (kv.sub !== undefined) {
      const n = parseFloat(kv.sub);
      out.sub = Number.isFinite(n) ? clamp(Math.round(n), 1, 8) : 1;
    }
    if (kv.swing !== undefined) {
      const n = parseFloat(kv.swing);
      out.swing = Number.isFinite(n) ? clamp(Math.round(n), 50, 75) : 50;
    }
    return out;
  }

  function serializeHash(st) {
    let s =
      "bpm=" +
      Math.round(st.bpm) +
      "&beats=" +
      st.beats.map((b) => GLYPH[b]).join("") +
      "&sub=" +
      st.sub;
    if (st.swing !== 50) s += "&swing=" + st.swing;
    return s;
  }

  /* §7.3 — wrap at musical group boundaries, derived from accent positions. */
  function rowsFromBeats(beats) {
    const accents = [];
    beats.forEach((b, i) => {
      if (b === "accent") accents.push(i);
    });
    let sizes;
    /* group rows only while they stay readable — past six rows the accent
       pattern is clearer on even rows than on one row per group */
    if (accents.length > 1 && accents.length <= 6 && accents[0] === 0) {
      sizes = accents.map(
        (a, i) => (i + 1 < accents.length ? accents[i + 1] : beats.length) - a,
      );
    } else if (beats.length <= 8) {
      sizes = [beats.length];
    } else {
      const rows = Math.ceil(beats.length / 8),
        per = Math.ceil(beats.length / rows);
      sizes = [];
      let left = beats.length;
      while (left > 0) {
        const t = Math.min(per, left);
        sizes.push(t);
        left -= t;
      }
    }
    const out = [];
    let i = 0;
    for (const s of sizes) {
      out.push(beats.slice(i, i + s).map((st, j) => ({ st, index: i + j })));
      i += s;
    }
    return out;
  }

  /* ---------------------------------------------------------------- */

  class Controller {
    constructor(host, opts) {
      this.host = host;
      this.opts = opts || {};
      this.key = "metro.prefs." + (this.opts.id || "a");
      this.s = {
        bpm: 100,
        bpmText: "100",
        beats: ["accent", "normal", "normal", "normal"],
        sub: 1,
        swing: 50,
        volume: 80,
        countIn: 0,
        running: false,
        tick: 0,
        pending: false,
        panelOpen: false,
        hintDone: false,
        taps: [],
        copied: false,
        grouping: "",
        unsupported: false,
        startedAt: 0,
        lastElapsed: "",
        lastBars: 0,
        standalone: false,
        installDismissed: false,
      };
    }

    mount() {
      if (typeof window === "undefined") return;
      if (!window.AudioWorkletNode) {
        this.s.unsupported = true;
        this.paint();
        return;
      }
      try {
        this.s.standalone = matchMedia("(display-mode: standalone)").matches;
      } catch (e) {}
      /* The hint is Share-sheet instructions, which only mean anything on a
         touch device — iOS has no programmatic install to offer instead. */
      try {
        this.s.touch = matchMedia("(pointer: coarse)").matches;
      } catch (e) {
        this.s.touch = true;
      }
      const h = this.opts.syncUrl ? parseHash(location.hash) : parseHash("");
      let prefs = {};
      try {
        prefs = JSON.parse(localStorage.getItem(this.key) || "{}");
      } catch (e) {}
      if (typeof prefs.volume === "number") this.s.volume = prefs.volume;
      if (typeof prefs.countIn === "number")
        this.s.countIn = clamp(Math.round(prefs.countIn), 0, 5);
      if (prefs.hintDone2) this.s.hintDone = true;
      if (prefs.installDismissed) this.s.installDismissed = true;
      if (this.opts.syncUrl && !location.hash && prefs.pattern)
        Object.assign(h, parseHash(prefs.pattern));
      Object.assign(this.s, {
        bpm: h.bpm,
        bpmText: String(h.bpm),
        beats: h.beats,
        sub: h.sub,
        swing: h.swing,
      });
      this.writeHash();

      this.onHash = () => {
        if (!this.opts.syncUrl) return;
        const p = parseHash(location.hash);
        Object.assign(this.s, {
          bpm: p.bpm,
          bpmText: String(p.bpm),
          beats: p.beats,
          sub: p.sub,
          swing: p.swing,
        });
        this.reanchor({});
        this.postPattern();
        this.paint();
      };
      this.onKey = (e) => this.key_(e);
      this.onTouch = (e) => {
        if (e.touches && e.touches.length > 1) e.preventDefault();
      };
      this.unlock = () => this.ensure();
      addEventListener("hashchange", this.onHash);
      addEventListener("keydown", this.onKey);
      addEventListener("touchstart", this.onTouch, { passive: false });
      addEventListener("pointerdown", this.unlock, { once: true });
      this.onVis = () => {
        if (this.s.running && !this.wl) this.acquireWakeLock();
      };
      addEventListener("visibilitychange", this.onVis);
      this.frame = () => {
        this.tickFrame();
        this.raf = requestAnimationFrame(this.frame);
      };
      this.raf = requestAnimationFrame(this.frame);
      this.paint();
    }

    unmount() {
      cancelAnimationFrame(this.raf);
      removeEventListener("hashchange", this.onHash);
      removeEventListener("keydown", this.onKey);
      removeEventListener("touchstart", this.onTouch);
      removeEventListener("visibilitychange", this.onVis);
      if (this.wl) {
        try {
          this.wl.release();
        } catch (e) {}
        this.wl = null;
      }
      if (this.node)
        try {
          this.node.port.postMessage({ type: "stop" });
        } catch (e) {}
      if (this.ctx)
        try {
          this.ctx.close();
        } catch (e) {}
    }

    paint() {
      try {
        this.host.forceUpdate();
      } catch (e) {}
    }

    /* timing — main-thread mirror of the worklet, §2.4 / §2.9.3 */
    spt(bpm, sub) {
      return 60 / bpm / sub;
    }
    timeAtTick(k, a, bpm, sub, swing) {
      const s = this.spt(bpm, sub),
        p = Math.floor(k / 2),
        q = k - 2 * p;
      return (
        a.time + (2 * p - a.tick) * s + (q === 0 ? 0 : (swing / 100) * 2 * s)
      );
    }
    tickAtTime(t, a, bpm, sub, swing) {
      const s = this.spt(bpm, sub),
        rel = a.tick + (t - a.time) / s;
      const p = Math.floor(rel / 2),
        frac = (rel - 2 * p) / 2;
      return 2 * p + (frac < swing / 100 ? 0 : 1);
    }

    async ensure() {
      if (this.ctx) return this.ctx;
      if (this.loading) return this.loading;
      this.loading = (async () => {
        const ctx = new (window.AudioContext || window.webkitAudioContext)({
          latencyHint: "interactive",
        });
        try {
          if (navigator.audioSession) navigator.audioSession.type = "playback";
        } catch (e) {}
        const url = URL.createObjectURL(
          new Blob([WORKLET_SRC], { type: "application/javascript" }),
        );
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        const node = new AudioWorkletNode(ctx, "click-processor", {
          numberOfInputs: 0,
          outputChannelCount: [1],
        });
        node.connect(ctx.destination);
        node.port.postMessage({ type: "volume", value: this.s.volume / 100 });
        this.ctx = ctx;
        this.node = node;
        return ctx;
      })();
      return this.loading;
    }

    async acquireWakeLock() {
      try {
        if (navigator.wakeLock)
          this.wl = await navigator.wakeLock.request("screen");
      } catch (e) {}
    }

    /* §1.9.8 — the press is never dropped. Flip state and paint immediately;
       the transport joins as soon as the context is actually running. */
    start() {
      const s = this.s;
      s.running = true;
      s.pending = false;
      s.armed = true;
      s.tick = 0;
      this.a = null;
      this.paint();
      this.acquireWakeLock();
      this.ensure().then(
        (ctx) => {
          if (!this.s.running) return;
          const go = () => {
            if (!this.s.running || !this.node) return;
            const st = this.s,
              span = st.beats.length * st.sub;
            const startTick = st.countIn ? -(st.countIn * st.sub) : 0;
            const anchor = { tick: startTick, time: ctx.currentTime + 0.08 };
            const sw = swingApplies(st.sub) ? st.swing : 50;
            this.a = anchor;
            this.abpm = st.bpm;
            this.asub = st.sub;
            this.aswing = sw;
            this.node.port.postMessage({
              type: "start",
              anchor,
              bpm: st.bpm,
              subdivision: st.sub,
              swing: sw,
              pattern: st.beats,
            });
            st.tick = startTick;
            st.startedAt = anchor.time;
            st.armed = false;
            this.paint();
          };
          if (ctx.state === "running") {
            go();
            return;
          }
          let done = false;
          const onState = () => {
            if (done || ctx.state !== "running") return;
            done = true;
            ctx.removeEventListener("statechange", onState);
            go();
          };
          ctx.addEventListener("statechange", onState);
          try {
            const p = ctx.resume();
            if (p && p.then) p.then(onState, () => {});
          } catch (e) {}
          onState();
        },
        () => {},
      );
    }

    stop() {
      if (this.node) this.node.port.postMessage({ type: "stop" });
      if (this.wl) {
        try {
          this.wl.release();
        } catch (e) {}
        this.wl = null;
      }
      /* Freeze what the run reached before the live figures lose their source:
         the readout stays up as a record of it until the page is reloaded. */
      const span = this.s.beats.length * this.s.sub;
      this.s.lastBars = Math.max(0, Math.floor(this.s.tick / span));
      this.s.lastElapsed = clock(
        this.ctx ? Math.max(0, this.ctx.currentTime - this.s.startedAt) : 0,
      );
      this.s.running = false;
      this.s.pending = false;
      this.s.armed = false;
      this.a = null;
      this.paint();
    }

    toggle() {
      this.s.running ? this.stop() : this.start();
    }

    /* §2.5 */
    reanchor(next) {
      if (!this.ctx || !this.s.running || !this.a) return;
      const a = this.a,
        oldB = this.abpm,
        oldS = this.asub,
        oldSw = this.aswing;
      const nowTick = this.tickAtTime(
        this.ctx.currentTime + 0.02,
        a,
        oldB,
        oldS,
        oldSw,
      );
      let atick = 2 * Math.ceil(nowTick / 2);
      const atime = this.timeAtTick(atick, a, oldB, oldS, oldSw);
      const bpm = next.bpm !== undefined ? next.bpm : this.s.bpm;
      const sub = next.sub !== undefined ? next.sub : this.s.sub;
      const swingRaw = next.swing !== undefined ? next.swing : this.s.swing;
      const swing = swingApplies(sub) ? swingRaw : 50;
      if (sub !== oldS) atick = 2 * Math.round(((atick / oldS) * sub) / 2);
      const anchor = { tick: atick, time: atime };
      this.a = anchor;
      this.abpm = bpm;
      this.asub = sub;
      this.aswing = swing;
      this.node.port.postMessage({
        type: "reanchor",
        anchor,
        bpm,
        subdivision: sub,
        swing,
        applyAtTime: atime,
      });
    }

    postPattern() {
      if (this.node)
        this.node.port.postMessage({ type: "pattern", pattern: this.s.beats });
      if (this.s.running) this.s.pending = true;
    }

    tickFrame() {
      if (!this.s.running || !this.ctx || !this.a) return;
      const lat = this.ctx.outputLatency || this.ctx.baseLatency || 0;
      const t = Math.floor(
        this.tickAtTime(
          this.ctx.currentTime - lat,
          this.a,
          this.abpm,
          this.asub,
          this.aswing,
        ),
      );
      const secs = Math.floor(
        Math.max(0, this.ctx.currentTime - this.s.startedAt),
      );
      if (t !== this.s.tick || secs !== this.lastSecs) {
        const span = this.s.beats.length * this.s.sub;
        if (
          this.s.pending &&
          t >= 0 &&
          Math.floor(t / span) !== Math.floor(this.s.tick / span)
        )
          this.s.pending = false;
        this.s.tick = t;
        this.lastSecs = secs;
        this.paint();
      }
    }

    savePrefs(patch) {
      try {
        const cur = JSON.parse(localStorage.getItem(this.key) || "{}");
        localStorage.setItem(
          this.key,
          JSON.stringify(Object.assign(cur, patch)),
        );
      } catch (e) {}
    }

    writeHash() {
      const s = serializeHash(this.s);
      this.hash = s;
      clearTimeout(this.hashT);
      this.hashT = setTimeout(() => {
        if (this.opts.syncUrl) {
          try {
            history.replaceState(null, "", "#" + s);
          } catch (e) {}
        }
        this.savePrefs({ pattern: s });
      }, 300);
    }

    setBpm(v, retext) {
      const bpm = clamp(Math.round(v), 20, 300);
      this.s.bpm = bpm;
      if (retext) this.s.bpmText = String(bpm);
      this.writeHash();
      this.reanchor({ bpm });
      this.paint();
    }
    setSub(sub) {
      this.s.sub = sub;
      this.writeHash();
      this.reanchor({ sub });
      this.paint();
    }
    setSwing(swing) {
      this.s.swing = swing;
      this.writeHash();
      this.reanchor({ swing });
      this.paint();
    }
    setVolume(v) {
      this.s.volume = v;
      this.savePrefs({ volume: v });
      if (this.node)
        this.node.port.postMessage({ type: "volume", value: v / 100 });
      this.paint();
    }
    setBeats(beats) {
      this.s.beats = beats;
      this.s.hintDone = true;
      this.savePrefs({ hintDone2: true });
      this.writeHash();
      this.postPattern();
      this.paint();
    }
    cycleBeat(i) {
      const b = this.s.beats.slice();
      const at = CYCLE.indexOf(b[i]);
      b[i] = CYCLE[(at < 0 ? 0 : at + 1) % CYCLE.length];
      this.setBeats(b);
    }
    resize(d) {
      const b = this.s.beats.slice();
      if (d > 0 && b.length < 30) b.push("normal");
      if (d < 0 && b.length > 2) b.pop();
      this.setBeats(b);
    }
    tap() {
      const taps = this.s.taps.concat(performance.now()).slice(-8);
      this.s.taps = taps;
      const bpm = tapTempo(taps);
      if (bpm) this.setBpm(bpm, true);
      else this.paint();
    }
    key_(e) {
      if (!this.opts.keyboard) return;
      if (e.target && e.target.tagName === "INPUT") return;
      const s = this.s;
      if (e.code === "Space") {
        e.preventDefault();
        this.toggle();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.setBpm(s.bpm + (e.shiftKey ? 10 : 1), true);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        this.setBpm(s.bpm - (e.shiftKey ? 10 : 1), true);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        this.resize(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        this.resize(-1);
      } else if (e.key === "t" || e.key === "T") this.tap();
    }

    /* ---- semantic values for a variant's renderVals ---- */
    vals() {
      const s = this.s;
      const span = s.beats.length * s.sub;
      const curBeat =
        s.running && s.tick >= 0
          ? Math.floor((((s.tick % span) + span) % span) / s.sub)
          : -1;
      const bars = s.running
        ? Math.max(0, Math.floor(s.tick / span))
        : s.lastBars;
      const elapsed = s.running
        ? clock(this.ctx ? Math.max(0, this.ctx.currentTime - s.startedAt) : 0)
        : s.lastElapsed;
      return {
        s,
        unsupported: s.unsupported,
        bpm: s.bpm,
        bpmText: s.bpmText,
        marking: tempoMarking(s.bpm),
        running: s.running,
        pending: s.pending,
        hintVisible: !s.hintDone,
        beatCount: s.beats.length,
        curBeat,
        bars,
        elapsed,
        tapCount: s.taps.length,
        volume: s.volume,
        swing: s.swing,
        sub: s.sub,
        swingDisabled: !swingApplies(s.sub),
        swingName: swingApplies(s.sub)
          ? (PRESETS.find((p) => p[1] === s.swing) || [s.swing + "%"])[0]
          : "",
        swingHeading: "swing",
        swingNote: "Needs an even number of clicks per beat.",
        subLabel: s.sub === 1 ? "one" : s.sub + " per beat",
        rows: rowsFromBeats(s.beats).map((cells) =>
          cells.map((c) => ({
            index: c.index,
            st: c.st,
            live: c.index === curBeat,
          })),
        ),
        subOptions: SUBS.map((v) => ({
          value: v,
          glyph: PICTO[v],
          active: s.sub === v,
        })),
        presets: PRESETS.map(([label, v]) => ({
          label,
          value: v,
          active: s.swing === v,
        })),
        hash: "#" + (this.hash || serializeHash(s)),
        showInstall: s.touch && !s.standalone && !s.installDismissed,
        onDismissInstall: () => {
          this.s.installDismissed = true;
          this.savePrefs({ installDismissed: true });
          this.paint();
        },
        copied: s.copied,
        onToggle: () => this.toggle(),
        onTap: () => this.tap(),
        onBeat: (i) => this.cycleBeat(i),
        onSub: (v) => this.setSub(v),
        onSwing: (v) => this.setSwing(v),
        onVolume: (v) => this.setVolume(v),
        onResize: (d) => this.resize(d),
        onBpmDelta: (d) => this.setBpm(s.bpm + d, true),
        onBpmSet: (v) => this.setBpm(v, true),
        onBpmText: (raw) => {
          this.s.bpmText = raw;
          if (raw !== "") this.setBpm(parseInt(raw, 10), false);
          else this.paint();
        },
        onBpmCommit: () => {
          this.s.bpmText = String(this.s.bpm);
          this.paint();
        },
        onBpmDrag: (e) => {
          const startY = e.clientY,
            startBpm = s.bpm,
            el2 = e.currentTarget;
          try {
            el2.setPointerCapture(e.pointerId);
          } catch (err) {}
          const mv = (ev) => {
            if (Math.abs(startY - ev.clientY) > 3) el2.blur();
            this.setBpm(startBpm + Math.round((startY - ev.clientY) / 3), true);
          };
          const up = () => {
            el2.removeEventListener("pointermove", mv);
            el2.removeEventListener("pointerup", up);
            try {
              el2.releasePointerCapture(e.pointerId);
            } catch (err) {}
          };
          el2.addEventListener("pointermove", mv);
          el2.addEventListener("pointerup", up);
        },
        onPanel: () => {
          this.s.panelOpen = !this.s.panelOpen;
          this.paint();
        },
        panelOpen: s.panelOpen,
        onGrouping: (v) => {
          this.s.grouping = v;
          const g = parseGrouping(v);
          if (g) this.setBeats(g);
          else this.paint();
        },
        grouping: s.grouping,
        countIn: s.countIn,
        countInLabel:
          s.countIn === 0
            ? "No\ncount-in"
            : s.countIn === 1
              ? "Count-in\n1 beat"
              : "Count-in\n" + s.countIn + " beats",
        onCountIn: () => {
          this.s.countIn = (this.s.countIn + 1) % 6;
          this.savePrefs({ countIn: this.s.countIn });
          this.paint();
        },
        onCopy: async () => {
          const url =
            location.origin +
            location.pathname +
            "#" +
            (this.hash || serializeHash(s));
          try {
            if (navigator.share) await navigator.share({ url });
            else await navigator.clipboard.writeText(url);
            this.s.copied = true;
            this.paint();
            setTimeout(() => {
              this.s.copied = false;
              this.paint();
            }, 1600);
          } catch (e) {}
        },
      };
    }
  }

  window.MetronomeCore = {
    SUBS,
    PRESETS,
    PICTO,
    clamp,
    tempoMarking,
    parseGrouping,
    tapTempo,
    parseHash,
    serializeHash,
    rowsFromBeats,
    swingApplies,
    LEVELS,
    CYCLE,
    LEVEL_NAME,
    Controller,
  };
})();
