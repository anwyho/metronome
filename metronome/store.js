/* The application state, the actions that change it, and the wiring between
   them and the engine. Replaces the state object with a new one on every
   change and tells its subscribers, so the UI can compare by identity. */

import { installContext } from "../pwa/install.js";
import { createEngine, supported } from "./engine.js";
import { createPrefs } from "./prefs.js";
import { cycleBeat, resize } from "./pattern.js";
import { DEFAULTS, parseHash, serializeHash } from "./share.js";
import { clampBpm, tapTempo } from "./tempo.js";
import { STRAIGHT, swingApplies } from "./swing.js";
import { reanchor, tickAtTime, visualLead } from "./timing.js";

/* How far ahead of the press the first click is scheduled. Long enough to
   survive a busy frame, short enough not to read as lag. */
const LEAD_IN = 0.08;
const MAX_COUNT_IN = 5;

const clock = (seconds) =>
  Math.floor(seconds / 60) +
  ":" +
  String(Math.floor(seconds % 60)).padStart(2, "0");

const span = (state) => state.beats.length * state.sub;

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
  };

  /* What the worklet was last told. Kept apart from `state` because it is the
     grid the audio thread is actually on, which a control change has not
     reached yet. */
  let live = null;
  let startedAt = 0;
  let frame = 0;
  let hashTimer = 0;

  const set = (patch) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  };

  /* ---- URL and preferences ---- */

  function writeHash() {
    const hash = serializeHash(state);
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
    set({ ...parsed, bpmText: String(parsed.bpm) });
  }

  /* ---- transport ---- */

  /* Always the whole grid, read from state after the action has updated it —
     never a patch over what the worklet happens to be playing. */
  function retime() {
    if (!live || !state.running) return;
    const message = reanchor(
      { ...live, now: engine.currentTime },
      { bpm: state.bpm, sub: state.sub, swing: state.swing },
    );
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
      retime();
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
      retime();
    },
    setSwing(swing) {
      set({ swing });
      writeHash();
      retime();
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
      const url =
        location.origin + location.pathname + "#" + serializeHash(state);
      try {
        if (navigator.share) await navigator.share({ url });
        else await navigator.clipboard.writeText(url);
        set({ copied: true });
        setTimeout(() => set({ copied: false }), 1600);
      } catch {}
    },
  };

  /* ---- lifecycle ---- */

  /* Registering a listener hands back how to undo it, so an added listener and
     a removed one cannot drift apart. */
  const teardown = [];
  function on(type, handler, options) {
    addEventListener(type, handler, options);
    teardown.push(() => removeEventListener(type, handler, options));
  }

  /* The link wins over what was last used here: a shared pattern has to open as
     the pattern that was shared. */
  function restore() {
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
  }

  function onKey(e) {
    if (!keyboard || e.target?.tagName === "INPUT") return;
    /* The physical key, so a layout that puts something else there still starts
       and stops the transport. */
    if (e.code === "Space") {
      e.preventDefault();
      actions.toggle();
      return;
    }
    if (e.key === "t" || e.key === "T") {
      actions.tap();
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    const arrows = {
      ArrowUp: () => actions.nudgeBpm(step),
      ArrowDown: () => actions.nudgeBpm(-step),
      ArrowRight: () => actions.resizeBeats(1),
      ArrowLeft: () => actions.resizeBeats(-1),
    };
    if (!Object.hasOwn(arrows, e.key)) return;
    e.preventDefault();
    arrows[e.key]();
  }

  function mount() {
    if (state.unsupported) return;
    restore();

    on("hashchange", () => {
      if (!syncUrl) return;
      adopt(parseHash(location.hash));
      writeHash();
      retime();
      postPattern();
    });
    on("keydown", onKey);
    /* A second finger on a control is a pinch-zoom gesture otherwise. */
    on(
      "touchstart",
      (e) => {
        if (e.touches && e.touches.length > 1) e.preventDefault();
      },
      { passive: false },
    );
    on("visibilitychange", () => {
      if (state.running && !engine.holdsWakeLock) engine.acquireWakeLock();
    });
    /* Opening the context on the first press of anything, rather than on the
       press of Start, means Start never waits for it. */
    on("pointerdown", () => engine.open().catch(() => {}), { once: true });

    const tick = () => {
      readTransport();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }

  function unmount() {
    cancelAnimationFrame(frame);
    clearTimeout(hashTimer);
    for (const undo of teardown.splice(0)) undo();
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
