/* The acceleration curve behind press-and-hold. Pure, and expressed as total
   steps rather than an interval: the driver asks how many steps a hold of this
   length is worth and applies the difference, so a dropped frame is caught up
   rather than lost, and the same hold always travels the same distance. */

/* Long enough that a tap is unambiguously a tap. */
export const HOLD_DELAY = 0.35;
/* How long the hold takes to reach full speed. */
const RAMP_SECONDS = 4;
/* Steps per second when repeating begins. Starting slow is the point: the first
   second has to be usable for a nudge of two or three, whatever is being
   nudged. */
export const MIN_RATE = 4;
/* The ceiling belongs to the control, not the curve — a hold has to cross the
   range it is driving in a few seconds, and the tempo's range is forty times
   the beat count's. */
export const MAX_RATE = 120;

/* The integral of a rate that climbs to the ceiling as the square of how long
   the hold has run, and then holds it. Squared rather than linear because a
   linear climb is already well past four steps a second by the time the first
   repeat lands, and the opening of a hold is exactly the part that has to stay
   usable for a nudge of two or three. */
export function stepsAfter(held, maxRate = MAX_RATE) {
  const t = held - HOLD_DELAY;
  if (!(t > 0)) return 0;
  const ramped = Math.min(t, RAMP_SECONDS);
  const climbing =
    MIN_RATE * ramped +
    ((maxRate - MIN_RATE) * ramped ** 3) / (3 * RAMP_SECONDS ** 2);
  return Math.floor(climbing + maxRate * Math.max(0, t - RAMP_SECONDS));
}
