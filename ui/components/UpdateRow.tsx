import { h } from "../../vendor/preact.module.js";
import { useServiceWorker } from "../hooks/useServiceWorker.js";

/* Checking is silent. Finding something raises the offer beside the version it
   would replace, and the reload is always the reader's press — a deploy never
   interrupts a running metronome. */
export function UpdateRow() {
  const { version, update, apply } = useServiceWorker();
  return (
    <div class="version">
      <span>Version {version || "—"}</span>
      {update ? <button onClick={apply}>Update available</button> : null}
    </div>
  );
}
