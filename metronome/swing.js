/* Swing: the named stops, and what to call a value between them. Pure.
   `swingApplies` lives in timing.js, where the tick pair it depends on is
   defined. */

import { swingApplies } from "./timing.js";

export const STRAIGHT = 50;
/* The off-tick can land anywhere in the pair bar the very ends, where it would
   collide with the tick on either side. Under 50 it lands early — reverse
   swing; the worklet's tick times and its shortest-click cap already handle it. */
export const MIN_SWING = 5;
export const MAX_SWING = 95;

const NAMED = [
  ["Straight", 50],
  ["Light", 55],
  ["Medium", 60],
  ["Swing", 67],
  ["Hard", 75],
];

/* Every named stop has a mirror below 50. */
export const PRESETS = [
  ...NAMED.filter(([, value]) => value !== STRAIGHT)
    .map(([name, value]) => [`Reverse ${name.toLowerCase()}`, 100 - value])
    .reverse(),
  ...NAMED,
];

export const clampSwing = (swing) =>
  Math.min(MAX_SWING, Math.max(MIN_SWING, Math.round(swing)));

/* Empty when the subdivision cannot carry swing at all — the control is
   disabled then, and naming a value it is not applying would be a lie. */
export function swingName(swing, sub) {
  if (!swingApplies(sub)) return "";
  const preset = PRESETS.find(([, value]) => value === swing);
  return preset ? preset[0] : swing + "%";
}

/* Where a value sits on the slider, 0 to 1. The guide dots and the thumb read
   the same span, so they cannot drift apart. */
export const swingFraction = (swing) =>
  (swing - MIN_SWING) / (MAX_SWING - MIN_SWING);

/* Where in the tick pair the off-click actually lands, 0 to 1 — which is what
   the pair illustration draws, and is not the same number as the slider's
   position. */
export const pairPosition = (swing) => swing / 100;
