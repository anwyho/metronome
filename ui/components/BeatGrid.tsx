import { h } from "../../vendor/preact.module.js";
import { useRef } from "../../vendor/hooks.module.js";
import { LEVEL_NAME } from "../../metronome/pattern.js";
import type { Pattern } from "../../metronome/pattern.js";
import type { Actions } from "../../metronome/store.js";
import { gridMetrics } from "../layout.js";
import { useViewport } from "../hooks/useViewport.js";
import { HoldButton } from "./HoldButton.js";

/* Twenty-two beats separate the ends of the range, so a hold crosses it in
   about four seconds. The tempo's ceiling here would cross it in one frame. */
const BEATS_PER_SECOND = 12;

export function BeatGrid({
  beats,
  current,
  actions,
}: {
  beats: Pattern;
  current: number;
  actions: Actions;
}) {
  /* The box is whatever the column has left after the tempo and the transport
     take theirs, so it is measured rather than predicted. */
  const box = useRef<HTMLDivElement>(null);
  const { vw, vh } = useViewport(box);
  const metrics = gridMetrics(vw, vh, beats.length);

  return (
    <section class="beats">
      <div class="grid" ref={box}>
        <div
          class="grid__inner"
          style={{
            "--grid-width": metrics.width + "px",
            "--grid-gap": metrics.gap + "px",
            "--ring": metrics.ring + "px",
            gridTemplateColumns: `repeat(${metrics.cols}, minmax(0, 1fr))`,
          }}
        >
          {beats.map((level, index) => (
            <button
              key={index}
              class="cell"
              aria-label={`Beat ${index + 1}, ${LEVEL_NAME[level]}`}
              onClick={() => actions.cycleBeat(index)}
            >
              <div
                class="cell__dot"
                data-level={level}
                data-live={index === current ? "" : null}
              ></div>
            </button>
          ))}
        </div>
      </div>

      <div class="beats__count">
        <HoldButton
          class="round round--sm"
          aria-label="Fewer beats"
          maxRate={BEATS_PER_SECOND}
          onStep={(steps) => actions.resizeBeats(-steps)}
        >
          −
        </HoldButton>
        <span>{beats.length} beats</span>
        <HoldButton
          class="round round--sm"
          aria-label="More beats"
          maxRate={BEATS_PER_SECOND}
          onStep={(steps) => actions.resizeBeats(steps)}
        >
          +
        </HoldButton>
      </div>
    </section>
  );
}
