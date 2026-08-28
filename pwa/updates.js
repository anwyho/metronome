/* The read side of `register.js`, which runs as a classic script during parse
   so the worker is being checked before the module graph has finished loading.
   This is how the app reads what it found. */

const info = () => window.__swInfo;

export const workerVersion = () => info()?.version ?? null;
export const updateReady = () => !!info()?.update;
export const applyUpdate = () => window.__applyUpdate?.();

export function onWorkerInfo(listener) {
  addEventListener("swinfo", listener);
  return () => removeEventListener("swinfo", listener);
}
