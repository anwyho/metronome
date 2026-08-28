/* The application state, the actions that change it, and the wiring between
   them and the engine. Replaces the state object with a new one on every
   change and tells its subscribers, so the UI can compare by identity. */

import { installContext } from "../pwa/install.js";
import { createEngine, supported } from "./engine.js";
import { createPrefs } from "./prefs.js";
import { cycleBeat, resize } from "./pattern.js";
import { DEFAULTS, parseHash, serializeHash } from "./share.js";
import { clampBpm, tapTempo } from "./tempo.js";
import { STRAIGHT } from "./swing.js";
import { reanchor, swingApplies, tickAtTime, visualLead } from "./timing.js";

/* How far ahead of the press the first click is scheduled. Long enough to
   survive a busy frame, short enough not to read as lag. */
const LEAD_IN = 0.08;
const MAX_COUNT_IN = 5;

const clock = (seconds) =>
  Math.floor(seconds / 60) +
  ":" +
  String(Math.floor(seconds % 60)).padStart(2, "0");

export const span = (state) => state.beats.length * state.sub;

export function currentBeat(state) {
  if (!state.running || state.tick < 0) return -1;
  const n = span(state);
  return Math.floor((((state.tick % n) + n) % n) / state.sub);
}

export function createStore({
  id = "a",
  syncUrl = true,
  keyboard = true,
} = {}) {
  const engine = createEngine();
  const prefs = createPrefs(id);
  const listeners = new Set();

  let state = {
    ...DEFAULTS,
    bpmText: String(DEFAULTS.bpm),
    volume: 80,
    countIn: 0,
    running: false,
    tick: 0,
    taps: [],
    copied: false,
    elapsed: "",
    bars: 0,
    unsupported: !supported,
    standalone: false,
    touch: true,
    installDismissed: false,
    hash: "",
  };

  /* What the worklet was last told. Kept apart from `state` because it is the
     grid the audio thread is actually on, which a control change has not
     reached yet. */
  let live = null;
  let startedAt = 0;
  let frame = 0;
  let hashTimer = 0;
  const bound = {};

  const set = (patch) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  };

  /* ---- URL and preferences ---- */

  function writeHash() {
    const hash = serializeHash(state);
    set({ hash });
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => {
      if (syncUrl) {
        try {
          history.replaceState(null, "", "#" + hash);
        } catch {}
      }
      prefs.save({ pattern: hash });
    }, 300);
  }

  function adopt(parsed) {
    set({
      bpm: parsed.bpm,
      bpmText: String(parsed.bpm),
      beats: parsed.beats,
      sub: parsed.sub,
      swing: parsed.swing,
    });
  }

  /* ---- transport ---- */

  function retime(next) {
    if (!live || !state.running) return;
    const message = reanchor({ ...live, now: engine.currentTime }, next);
    live = message;
    engine.post({
      type: "reanchor",
      anchor: message.anchor,
      bpm: message.bpm,
      subdivision: message.sub,
      swing: message.swing,
      applyAtTime: message.anchor.time,
    });
  }

  function postPattern() {
    engine.post({ type: "pattern", pattern: state.beats });
  }

  function start() {
    /* Flip and paint first: the press is never dropped, and the transport
       joins as soon as the context is actually running. */
    set({ running: true, tick: 0, elapsed: "0:00", bars: 0 });
    live = null;
    engine.acquireWakeLock();
    engine.resume().then(
      (ctx) => {
        if (!state.running) return;
        const startTick = state.countIn ? -(state.countIn * state.sub) : 0;
        const anchor = { tick: startTick, time: ctx.currentTime + LEAD_IN };
        const swing = swingApplies(state.sub) ? state.swing : STRAIGHT;
        live = { anchor, bpm: state.bpm, sub: state.sub, swing };
        engine.post({
          type: "start",
          anchor,
          bpm: state.bpm,
          subdivision: state.sub,
          swing,
          pattern: state.beats,
        });
        engine.post({ type: "volume", value: state.volume / 100 });
        startedAt = anchor.time;
        set({ tick: startTick });
      },
      () => {},
    );
  }

  function stop() {
    engine.post({ type: "stop" });
    engine.releaseWakeLock();
    /* Freeze what the run reached before the live figures lose their source:
       the readout stays up as a record of it. */
    set({
      running: false,
      bars: Math.max(0, Math.floor(state.tick / span(state))),
      elapsed: clock(Math.max(0, engine.currentTime - startedAt)),
    });
    live = null;
  }

  /* Reads the schedule slightly ahead of the frame so the lit dot arrives with
     the click rather than behind it. */
  function readTransport() {
    if (!state.running || !live) return;
    const lead = visualLead(live.bpm, live.sub);
    const tick = Math.floor(
      tickAtTime(
        engine.currentTime - engine.latency + lead,
        live.anchor,
        live.bpm,
        live.sub,
        live.swing,
      ),
    );
    const seconds = Math.max(0, engine.currentTime - startedAt);
    const elapsed = clock(seconds);
    if (tick === state.tick && elapsed === state.elapsed) return;
    set({
      tick,
      elapsed,
      bars: Math.max(0, Math.floor(tick / span(state))),
    });
  }

  /* ---- actions ---- */

  const actions = {
    toggle: () => (state.running ? stop() : start()),

    setBpm(value, retext = true) {
      const bpm = clampBpm(value);
      const moved = bpm !== state.bpm;
      set(retext ? { bpm, bpmText: String(bpm) } : { bpm });
      /* A hold pinned against the end of the range would otherwise rewrite the
         link and re-anchor the worklet on every frame, for no change. */
      if (!moved) return;
      writeHash();
      retime({ bpm });
    },
    nudgeBpm: (delta) => actions.setBpm(state.bpm + delta),
    setBpmText(raw) {
      const text = raw.replace(/[^0-9]/g, "");
      set({ bpmText: text });
      if (text !== "") actions.setBpm(parseInt(text, 10), false);
    },
    commitBpm: () => set({ bpmText: String(state.bpm) }),

    setSub(sub) {
      set({ sub });
      writeHash();
      retime({ sub });
    },
    setSwing(swing) {
      set({ swing });
      writeHash();
      retime({ swing });
    },
    setVolume(volume) {
      set({ volume });
      prefs.save({ volume });
      engine.post({ type: "volume", value: volume / 100 });
    },

    setBeats(beats) {
      set({ beats });
      writeHash();
      postPattern();
    },
    cycleBeat: (index) => actions.setBeats(cycleBeat(state.beats, index)),
    resizeBeats(delta) {
      const beats = resize(state.beats, delta);
      if (beats !== state.beats) actions.setBeats(beats);
    },

    tap() {
      const taps = [...state.taps, performance.now()].slice(-8);
      set({ taps });
      const bpm = tapTempo(taps);
      if (bpm) actions.setBpm(bpm);
    },

    cycleCountIn() {
      const countIn = (state.countIn + 1) % (MAX_COUNT_IN + 1);
      set({ countIn });
      prefs.save({ countIn });
    },

    dismissInstall() {
      set({ installDismissed: true });
      prefs.save({ installDismissed: true });
    },

    async share() {
      const url = location.origin + location.pathname + "#" + state.hash;
      try {
        if (navigator.share) await navigator.share({ url });
        else await navigator.clipboard.writeText(url);
        set({ copied: true });
        setTimeout(() => set({ copied: false }), 1600);
      } catch {}
    },
  };

  /* ---- lifecycle ---- */

  function mount() {
    if (state.unsupported) return;
    set(installContext());

    const saved = prefs.read();
    if (typeof saved.volume === "number") set({ volume: saved.volume });
    if (typeof saved.countIn === "number") {
      set({
        countIn: Math.min(MAX_COUNT_IN, Math.max(0, Math.round(saved.countIn))),
      });
    }
    if (saved.installDismissed) set({ installDismissed: true });

    const fromUrl = syncUrl ? location.hash : "";
    adopt(parseHash(fromUrl || (syncUrl && saved.pattern) || ""));
    writeHash();

    bound.hash = () => {
      if (!syncUrl) return;
      adopt(parseHash(location.hash));
      writeHash();
      retime({});
      postPattern();
    };
    bound.key = (e) => {
      if (!keyboard || (e.target && e.target.tagName === "INPUT")) return;
      if (e.code === "Space") {
        e.preventDefault();
        actions.toggle();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        actions.nudgeBpm(e.shiftKey ? 10 : 1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        actions.nudgeBpm(e.shiftKey ? -10 : -1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        actions.resizeBeats(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        actions.resizeBeats(-1);
      } else if (e.key === "t" || e.key === "T") {
        actions.tap();
      }
    };
    /* A second finger on a control is a pinch-zoom gesture otherwise. */
    bound.touch = (e) => {
      if (e.touches && e.touches.length > 1) e.preventDefault();
    };
    bound.visibility = () => {
      if (state.running && !engine.holdsWakeLock) engine.acquireWakeLock();
    };
    /* Opening the context on the first press of anything, rather than on the
       press of Start, means Start never waits for it. */
    bound.unlock = () => engine.open().catch(() => {});

    addEventListener("hashchange", bound.hash);
    addEventListener("keydown", bound.key);
    addEventListener("touchstart", bound.touch, { passive: false });
    addEventListener("visibilitychange", bound.visibility);
    addEventListener("pointerdown", bound.unlock, { once: true });

    const tick = () => {
      readTransport();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }

  function unmount() {
    cancelAnimationFrame(frame);
    clearTimeout(hashTimer);
    removeEventListener("hashchange", bound.hash);
    removeEventListener("keydown", bound.key);
    removeEventListener("touchstart", bound.touch);
    removeEventListener("visibilitychange", bound.visibility);
    removeEventListener("pointerdown", bound.unlock);
    engine.close();
  }

  return {
    get state() {
      return state;
    },
    actions,
    mount,
    unmount,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
