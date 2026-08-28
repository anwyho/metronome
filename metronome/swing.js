/* Swing: the named stops and what to call a value between them. Pure.
   `swingApplies` lives in timing.js, where the pair it depends on is defined. */

import { swingApplies } from "./timing.js";

export const MIN_SWING = 50;
export const MAX_SWING = 75;
export const STRAIGHT = 50;

export const PRESETS = [
  ["Straight", 50],
  ["Light", 55],
  ["Medium", 60],
  ["Swing", 67],
  ["Hard", 75],
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

/* Where a value sits on the slider, 0 to 1 — the guide dots and the thumb read
   the same span, so they cannot drift apart. */
export const swingFraction = (swing) =>
  (swing - MIN_SWING) / (MAX_SWING - MIN_SWING);
