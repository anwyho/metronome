/* The real source lives in worklet-processor.ts, compiled and type-checked as
   an ordinary module. tools/build.mjs overwrites dist/metronome/worklet.js
   with that compiled output inlined as a string once tsc has run, so this
   file's own value never ships — it exists only so
   `import { WORKLET_SRC } from "./worklet.js"` has something to type-check
   against. */
export const WORKLET_SRC: string = "";
