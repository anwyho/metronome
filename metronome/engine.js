/* Everything with a side effect: the audio context, the worklet node, and the
   screen wake lock. It holds no application state — the store tells it what to
   play and it plays it. */

import { WORKLET_SRC } from "./worklet.js";

export const supported =
  typeof window !== "undefined" && !!window.AudioWorkletNode;

export function createEngine() {
  let ctx = null;
  let node = null;
  let opening = null;
  let wakeLock = null;

  /* Opened on the first press rather than at load: a context created without a
     gesture starts suspended, and on iOS may never be allowed to run at all. */
  function open() {
    if (ctx) return Promise.resolve(ctx);
    if (opening) return opening;
    opening = (async () => {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      const audio = new Ctor({ latencyHint: "interactive" });
      /* Playback keeps the click going through a screen lock and through the
         ring/silent switch, at the price of taking the media channel. The web
         cannot ask for both — see the table in the README. */
      try {
        if (navigator.audioSession) navigator.audioSession.type = "playback";
      } catch {}
      const url = URL.createObjectURL(
        new Blob([WORKLET_SRC], { type: "application/javascript" }),
      );
      await audio.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      node = new AudioWorkletNode(audio, "click-processor", {
        numberOfInputs: 0,
        outputChannelCount: [1],
      });
      node.connect(audio.destination);
      ctx = audio;
      return ctx;
    })();
    return opening;
  }

  /* Resolves once the context is actually running. Safari resolves resume()
     before the state has moved, so the statechange is what is believed. */
  async function resume() {
    const audio = await open();
    if (audio.state === "running") return audio;
    await new Promise((done) => {
      const check = () => {
        if (audio.state !== "running") return;
        audio.removeEventListener("statechange", check);
        done();
      };
      audio.addEventListener("statechange", check);
      try {
        const p = audio.resume();
        if (p && p.then) p.then(check, () => {});
      } catch {}
      check();
    });
    return audio;
  }

  async function acquireWakeLock() {
    try {
      if (!navigator.wakeLock) return;
      const lock = await navigator.wakeLock.request("screen");
      /* The system drops the sentinel on its own — tab hidden, battery saver —
         and a dead one left here reads as held, so nothing would ever take a
         new one and the screen would sleep mid-run. */
      lock.addEventListener("release", () => {
        if (wakeLock === lock) wakeLock = null;
      });
      wakeLock = lock;
    } catch {}
  }

  function releaseWakeLock() {
    if (!wakeLock) return;
    try {
      wakeLock.release();
    } catch {}
    wakeLock = null;
  }

  function post(message) {
    if (node) node.port.postMessage(message);
  }

  return {
    supported,
    get currentTime() {
      return ctx ? ctx.currentTime : 0;
    },
    /* How far behind the clock the speaker actually is. */
    get latency() {
      return ctx ? ctx.outputLatency || ctx.baseLatency || 0 : 0;
    },
    get holdsWakeLock() {
      return !!wakeLock;
    },
    open,
    resume,
    post,
    acquireWakeLock,
    releaseWakeLock,
    close() {
      releaseWakeLock();
      post({ type: "stop" });
      try {
        if (ctx) ctx.close();
      } catch {}
      ctx = node = opening = null;
    },
  };
}
