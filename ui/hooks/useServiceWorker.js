import { useEffect, useState } from "../../vendor/hooks.module.js";

const read = () => ({
  version: window.__swInfo?.version ?? null,
  update: !!window.__swInfo?.update,
});

/* Registration and update detection run outside the app, so the worker is
   already being checked while this is still parsing. All the UI does is read
   the result and re-read it when it changes. */
export function useServiceWorker() {
  const [info, setInfo] = useState(read);
  useEffect(() => {
    const sync = () => setInfo(read());
    addEventListener("swinfo", sync);
    sync();
    return () => removeEventListener("swinfo", sync);
  }, []);
  return { ...info, apply: () => window.__applyUpdate?.() };
}
