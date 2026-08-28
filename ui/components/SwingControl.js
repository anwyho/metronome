import { html } from "../html.js";
import {
  MAX_SWING,
  MIN_SWING,
  PRESETS,
  STRAIGHT,
  swingFraction,
  swingName,
} from "../../metronome/swing.js";
import { swingApplies } from "../../metronome/timing.js";

export function SwingControl({ swing, sub, onChange }) {
  const off = !swingApplies(sub);
  const fraction = swingFraction(swing);
  /* The pair track is 24px of dot travelling across its own width, so the
     swung dot's left edge is the swing fraction of the track less the part of
     the dot already past it. */
  const swungLeft = `calc(${(fraction * 100).toFixed(1)}% - ${(fraction * 24 - 10).toFixed(0)}px)`;

  return html`
    <div class="field" data-disabled=${off ? "" : null}>
      <div class="field__head">
        <span class="field__label">swing</span>
        <!-- The row aligns on the baseline, so an absent name would leave the
             heading nothing to sit against and let it ride up, taking the whole
             panel with it. A blank keeps the line box, and the baseline. -->
        <span class="field__value" data-off=${off ? "" : null}>
          ${swingName(swing, sub) || " "}
        </span>
      </div>

      <div class="swing-pair">
        <div class="swing-pair__dot"></div>
        <div
          class="swing-pair__dot swing-pair__dot--swung"
          style=${{ "--swung-left": swungLeft }}
        ></div>
      </div>

      <div class="swing-slider">
        <div class="swing-guides" aria-hidden="true">
          <div class="swing-guides__track"></div>
          ${PRESETS.map(
            ([name, value]) => html`
              <div
                key=${name}
                class="swing-guides__stop"
                style=${{ "--at": swingFraction(value).toFixed(3) }}
              ></div>
            `,
          )}
        </div>
        <input
          class="slider"
          type="range"
          data-guides="1"
          min=${MIN_SWING}
          max=${MAX_SWING}
          step="1"
          value=${swing}
          disabled=${off}
          aria-label="Swing"
          onInput=${(e) => onChange(parseInt(e.target.value, 10) || STRAIGHT)}
        />
      </div>

      <span class="field__note">Needs an even number of clicks per beat.</span>
    </div>
  `;
}
