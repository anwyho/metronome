import { h } from "../../vendor/preact.module.js";
import type { Actions } from "../../metronome/store.js";
import { CountInButton } from "./CountInButton.js";

export function Transport({
  running,
  elapsed,
  bars,
  countIn,
  actions,
}: {
  running: boolean;
  elapsed: string;
  bars: number;
  countIn: number;
  actions: Actions;
}) {
  return (
    <section class="transport">
      <div class="counters" data-running={running ? "" : null}>
        {elapsed ? `${elapsed} · ${bars} bars` : ""}
      </div>
      <div class="transport__row">
        <CountInButton count={countIn} onCycle={actions.cycleCountIn} />
        <button
          class="start"
          data-running={running ? "" : null}
          onClick={actions.toggle}
        >
          {running ? "Stop" : "Start"}
        </button>
      </div>
    </section>
  );
}
