import type { JSX } from "preact";
import { h } from "../../vendor/preact.module.js";
import { tempoMarking } from "../../metronome/tempo.js";
import type { Actions } from "../../metronome/store.js";
import { HoldButton } from "./HoldButton.js";

/* Dragging the number is the third way to reach a tempo, after the buttons and
   typing. The pointer is captured so the gesture survives leaving the element,
   and the field is blurred once it is clearly a drag rather than a tap. */
function startDrag(
  event: JSX.TargetedPointerEvent<HTMLInputElement>,
  bpm: number,
  setBpm: (value: number) => void,
) {
  const el = event.currentTarget;
  const startY = event.clientY;
  try {
    el.setPointerCapture(event.pointerId);
  } catch {}

  const move = (e: PointerEvent) => {
    if (Math.abs(startY - e.clientY) > 3) el.blur();
    setBpm(bpm + Math.round((startY - e.clientY) / 3));
  };
  const end = () => {
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", end);
    try {
      el.releasePointerCapture(event.pointerId);
    } catch {}
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", end);
}

export function TempoControl({
  bpm,
  bpmText,
  actions,
}: {
  bpm: number;
  bpmText: string;
  actions: Actions;
}) {
  return (
    <section class="tempo">
      <span class="tempo__marking">{tempoMarking(bpm)}</span>
      <div class="tempo__row">
        <HoldButton
          class="round round--lg"
          aria-label="Decrease tempo"
          onStep={(steps) => actions.nudgeBpm(-steps)}
        >
          −
        </HoldButton>
        <div class="tempo__value">
          <input
            class="tempo__input"
            value={bpmText}
            inputmode="numeric"
            aria-label="Beats per minute"
            onInput={(e) => actions.setBpmText(e.currentTarget.value)}
            onPointerDown={(e) => startDrag(e, bpm, (v) => actions.setBpm(v))}
            onBlur={actions.commitBpm}
          />
          <span class="tempo__unit">bpm</span>
        </div>
        <HoldButton
          class="round round--lg"
          aria-label="Increase tempo"
          onStep={(steps) => actions.nudgeBpm(steps)}
        >
          +
        </HoldButton>
      </div>
      <button class="tap" aria-label="Tap tempo" onClick={actions.tap}>
        Tap
      </button>
    </section>
  );
}
