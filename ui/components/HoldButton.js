import { html } from "../html.js";
import { useHoldRepeat } from "../hooks/useHoldRepeat.js";

/* A button that repeats, faster the longer it is held. `onStep` is called with
   the number of steps to apply, which is more than one once the hold is moving
   faster than the screen refreshes. `maxRate` is the ceiling in steps a second,
   and belongs to whatever the button drives. */
export function HoldButton({ onStep, maxRate, children, ...rest }) {
  const hold = useHoldRepeat(onStep, maxRate);
  return html`<button ...${rest} ...${hold}>${children}</button>`;
}
