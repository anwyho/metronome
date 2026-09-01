import { useEffect, useState } from "../../vendor/hooks.module.js";
import {
  applyUpdate,
  onWorkerInfo,
  updateReady,
  workerVersion,
} from "../../pwa/updates.js";

const read = () => ({ version: workerVersion(), update: updateReady() });

/* Registration and update detection run outside the app, so the worker is
   already being checked while this is still parsing. All the UI does is read
   the result and re-read it when it changes. */
export function useServiceWorker() {
  const [info, setInfo] = useState(read);
  useEffect(() => {
    const sync = () => setInfo(read());
    sync();
    return onWorkerInfo(sync);
  }, []);
  return { ...info, apply: applyUpdate };
}
