/* Runs the audio-thread processor on the main thread: stub the two globals and
   the base class it is compiled against, then drive `process()` a quantum at a
   time and record every click it schedules. Asserting on the click sequence is
   what caught the subdivision drift; a spectrum of the output would not have. */

import { createContext, runInContext } from "node:vm";
import { WORKLET_SRC } from "../../metronome/worklet.js";

const QUANTUM = 128;

export function createWorklet({ sampleRate = 48000 } = {}) {
  const clicks = [];
  let Processor = null;

  const ctx = createContext({
    sampleRate,
    currentTime: 0,
    registerProcessor: (_name, cls) => {
      Processor = cls;
    },
    AudioWorkletProcessor: class {
      constructor() {
        this.port = { onmessage: null, postMessage() {} };
      }
    },
  });
  runInContext(WORKLET_SRC, ctx, { filename: "worklet.js" });

  const proc = new Processor();
  const scheduled = proc.trigger.bind(proc);
  proc.trigger = (voice, off) => {
    clicks.push({ voice, time: ctx.currentTime + off / sampleRate });
    scheduled(voice, off);
  };

  const out = new Float32Array(QUANTUM);
  const outputs = [[out]];

  return {
    clicks,
    /* The audio thread moves a render quantum at a time, and so does a click's
       scheduled time once it is rounded to a sample. */
    quantum: QUANTUM / sampleRate,
    get time() {
      return ctx.currentTime;
    },
    send(message) {
      proc.port.onmessage({ data: message });
    },
    /* Advances at least `seconds`, always on a quantum boundary — the audio
       thread has no finer step either. */
    advance(seconds) {
      const until = ctx.currentTime + seconds;
      while (ctx.currentTime < until) {
        proc.process([], outputs, {});
        ctx.currentTime += QUANTUM / sampleRate;
      }
    },
  };
}
