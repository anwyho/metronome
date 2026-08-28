import { html } from "../html.js";
import { CountInButton } from "./CountInButton.js";

export function Transport({ running, elapsed, bars, countIn, actions }) {
  return html`
    <section class="transport">
      <div class="counters" data-running=${running ? "" : null}>
        ${elapsed ? `${elapsed} · ${bars} bars` : ""}
      </div>
      <div class="transport__row">
        <${CountInButton} count=${countIn} onCycle=${actions.cycleCountIn} />
        <button
          class="start"
          data-running=${running ? "" : null}
          onClick=${actions.toggle}
        >
          ${running ? "Stop" : "Start"}
        </button>
      </div>
    </section>
  `;
}
