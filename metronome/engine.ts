/* Everything with a side effect: the audio context, the worklet node, and the
   screen wake lock. It holds no application state — the store tells it what to
   play and it plays it. */

import type { Pattern } from "./pattern.js";
import type { Anchor } from "./timing.js";
import { WORKLET_SRC } from "./worklet.js";

/* The protocol with the audio thread. `subdivision` is spelled out here and
   `sub` everywhere else — the wire format is the worklet's, not the store's. */
export interface StartMessage {
  type: "start";
  anchor: Anchor;
  bpm: number;
  subdivision: number;
  swing: number;
  pattern: Pattern;
}
export interface ReanchorMessage {
  type: "reanchor";
  anchor: Anchor;
  bpm: number;
  subdivision: number;
  swing: number;
  applyAtTime: number;
}
export interface StopMessage {
  type: "stop";
}
export interface PatternMessage {
  type: "pattern";
  pattern: Pattern;
}
export interface VolumeMessage {
  type: "volume";
  value: number;
}
export type WorkletMessage =
  StartMessage | ReanchorMessage | StopMessage | PatternMessage | VolumeMessage;

export interface Engine {
  readonly supported: boolean;
  readonly currentTime: number;
  readonly latency: number;
  readonly holdsWakeLock: boolean;
  open(): Promise<AudioContext>;
  resume(): Promise<AudioContext>;
  post(message: WorkletMessage): void;
  acquireWakeLock(): Promise<void>;
  releaseWakeLock(): void;
  close(): void;
}

export const supported =
  typeof window !== "undefined" && !!window.AudioWorkletNode;

export function createEngine(): Engine {
  let ctx: AudioContext | null = null;
  let node: AudioWorkletNode | null = null;
  let opening: Promise<AudioContext> | null = null;
  let wakeLock: WakeLockSentinel | null = null;

  /* Opened on the first press rather than at load: a context created without a
     gesture starts suspended, and on iOS may never be allowed to run at all. */
  function open(): Promise<AudioContext> {
    if (ctx) return Promise.resolve(ctx);
    if (opening) return opening;
    opening = (async () => {
      const Ctor = window.AudioContext || window.webkitAudioContext!;
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
  async function resume(): Promise<AudioContext> {
    const audio = await open();
    if (audio.state === "running") return audio;
    await new Promise<void>((done) => {
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

  async function acquireWakeLock(): Promise<void> {
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

  function releaseWakeLock(): void {
    if (!wakeLock) return;
    try {
      wakeLock.release();
    } catch {}
    wakeLock = null;
  }

  function post(message: WorkletMessage): void {
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
