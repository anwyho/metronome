import { html } from "../html.js";
import { LEVEL_NAME } from "../../metronome/pattern.js";
import { GAP } from "../layout.js";
import { HoldButton } from "./HoldButton.js";

/* Twenty-two beats separate the ends of the range, so a hold crosses it in
   about four seconds. The tempo's ceiling here would cross it in one frame. */
const BEATS_PER_SECOND = 12;

export function BeatGrid({ beats, current, metrics, onTap, onResize }) {
  return html`
    <section class="beats">
      <div class="grid" style=${{ "--grid-height": metrics.height + "px" }}>
        <div
          class="grid__inner"
          style=${{
            "--grid-width": metrics.width + "px",
            "--grid-gap": GAP + "px",
            "--ring": metrics.ring + "px",
            gridTemplateColumns: `repeat(${metrics.cols}, minmax(0, 1fr))`,
          }}
        >
          ${beats.map(
            (level, index) => html`
              <button
                key=${index}
                class="cell"
                aria-label=${`Beat ${index + 1}, ${LEVEL_NAME[level]}`}
                onClick=${() => onTap(index)}
              >
                <div
                  class="cell__dot"
                  data-level=${level}
                  data-live=${index === current ? "" : null}
                ></div>
              </button>
            `,
          )}
        </div>
      </div>

      <div class="beats__count">
        <${HoldButton}
          class="round round--sm"
          aria-label="Fewer beats"
          maxRate=${BEATS_PER_SECOND}
          onStep=${(steps) => onResize(-steps)}
        >
          −
        </${HoldButton}>
        <span>${beats.length} beats</span>
        <${HoldButton}
          class="round round--sm"
          aria-label="More beats"
          maxRate=${BEATS_PER_SECOND}
          onStep=${(steps) => onResize(steps)}
        >
          +
        </${HoldButton}>
      </div>
    </section>
  `;
}
