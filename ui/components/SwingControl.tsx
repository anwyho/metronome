import { h } from "../../vendor/preact.module.js";
import {
  MAX_SWING,
  MIN_SWING,
  PRESETS,
  STRAIGHT,
  pairPosition,
  swingFraction,
  swingApplies,
  swingName,
} from "../../metronome/swing.js";

export function SwingControl({
  swing,
  sub,
  onChange,
}: {
  swing: number;
  sub: number;
  onChange: (swing: number) => void;
}) {
  const off = !swingApplies(sub);
  /* The dot's left edge runs from 10px at the pair's start to 14px short of
     the far end, so it stays inside the track at both extremes. */
  const at = pairPosition(swing);
  const swungLeft = `calc(${(at * 100).toFixed(1)}% - ${(at * 24 - 10).toFixed(1)}px)`;

  return (
    <div class="field" data-disabled={off ? "" : null}>
      <div class="field__head">
        <span class="field__label">swing</span>
        {/* The row aligns on the baseline, so an absent name would leave the
            heading nothing to sit against and let it ride up, taking the whole
            panel with it. A blank keeps the line box, and the baseline. */}
        <span class="field__value" data-off={off ? "" : null}>
          {swingName(swing, sub) || " "}
        </span>
      </div>

      <div class="swing-pair">
        <div class="swing-pair__dot"></div>
        <div
          class="swing-pair__dot swing-pair__dot--swung"
          style={{ "--swung-left": swungLeft }}
        ></div>
      </div>

      <div class="swing-slider">
        <div class="swing-guides" aria-hidden="true">
          <div class="swing-guides__track"></div>
          {PRESETS.map(([name, value]) => (
            <div
              key={name}
              class="swing-guides__stop"
              style={{ "--at": swingFraction(value).toFixed(3) }}
            ></div>
          ))}
        </div>
        <input
          class="slider"
          type="range"
          data-guides="1"
          min={MIN_SWING}
          max={MAX_SWING}
          step="1"
          value={swing}
          disabled={off}
          aria-label="Swing"
          onInput={(e) =>
            onChange(parseInt(e.currentTarget.value, 10) || STRAIGHT)
          }
        />
      </div>

      {/* Always rendered, shown only when the constraint is actually biting.
          Removing it would take its line box with it and lift every row below
          the swing control by the height of a line. */}
      <span class="field__note" data-shown={off ? "" : null}>
        Needs an even number of clicks per beat.
      </span>
    </div>
  );
}
