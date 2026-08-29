export {};

declare global {
  class AudioWorkletProcessor {
    readonly port: MessagePort;
    constructor();
    process(
      inputs: Float32Array[][],
      outputs: Float32Array[][],
      parameters: Record<string, Float32Array>,
    ): boolean;
  }
  function registerProcessor(
    name: string,
    ctor: typeof AudioWorkletProcessor,
  ): void;
  const currentTime: number;
  const sampleRate: number;
}
