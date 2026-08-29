/* Runs the audio-thread processor on the main thread: stub the two globals and
   the base class it is compiled against, then drive `process()` a quantum at a
   time and record every click it schedules. Asserting on the click sequence is
   what caught the subdivision drift; a spectrum of the output would not have. */

import { createContext, runInContext } from "node:vm";
import { WORKLET_SRC } from "../../metronome/worklet.js";
import type { WorkletMessage } from "../../metronome/engine.js";

const QUANTUM = 128;

interface Click {
  voice: string;
  time: number;
}

interface ProcessorInstance {
  port: {
    onmessage: ((e: { data: WorkletMessage }) => void) | null;
    postMessage(): void;
  };
  trigger(voice: string, off: number): void;
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, never>,
  ): boolean;
}

interface Sandbox {
  sampleRate: number;
  currentTime: number;
  registerProcessor: (name: string, cls: new () => ProcessorInstance) => void;
  AudioWorkletProcessor: new () => Pick<ProcessorInstance, "port">;
}

export function createWorklet({ sampleRate = 48000 } = {}) {
  const clicks: Click[] = [];
  let Processor: (new () => ProcessorInstance) | null = null;

  const sandbox: Sandbox = {
    sampleRate,
    currentTime: 0,
    registerProcessor: (_name, cls) => {
      Processor = cls;
    },
    AudioWorkletProcessor: class {
      port = { onmessage: null, postMessage() {} };
    },
  };
  createContext(sandbox);
  runInContext(WORKLET_SRC, sandbox, { filename: "worklet.js" });

  const proc = new Processor!();
  const scheduled = proc.trigger.bind(proc);
  proc.trigger = (voice: string, off: number) => {
    clicks.push({ voice, time: sandbox.currentTime + off / sampleRate });
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
      return sandbox.currentTime;
    },
    send(message: WorkletMessage) {
      proc.port.onmessage!({ data: message });
    },
    /* Advances at least `seconds`, always on a quantum boundary — the audio
       thread has no finer step either. */
    advance(seconds: number) {
      const until = sandbox.currentTime + seconds;
      while (sandbox.currentTime < until) {
        proc.process([], outputs, {});
        sandbox.currentTime += QUANTUM / sampleRate;
      }
    },
  };
}
