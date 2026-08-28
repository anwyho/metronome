/* The bar: what each beat sounds like, how the count changes, and how the row
   of beats wraps for display. Pure. */

export const LEVELS = ["accent", "minor", "normal", "muted"];
/* Tapping a beat walks up from silence, so the first tap on a silent beat
   makes a sound rather than taking one away. */
export const CYCLE = ["muted", "normal", "minor", "accent"];
export const GLYPH = { accent: "X", minor: "x", normal: "o", muted: "." };
export const LEVEL_NAME = {
  accent: "major accent",
  minor: "minor accent",
  normal: "beat",
  muted: "silent",
};

export const MIN_BEATS = 2;
export const MAX_BEATS = 24;

export const cycleLevel = (level) => {
  const at = CYCLE.indexOf(level);
  return CYCLE[(at < 0 ? 0 : at + 1) % CYCLE.length];
};

export function cycleBeat(beats, index) {
  const next = beats.slice();
  next[index] = cycleLevel(next[index]);
  return next;
}

export function resize(beats, delta) {
  if (delta > 0 && beats.length < MAX_BEATS) return [...beats, "normal"];
  if (delta < 0 && beats.length > MIN_BEATS) return beats.slice(0, -1);
  return beats;
}

/* "3+3+2" — a sum of group lengths, each group starting on an accent. */
export function parseGrouping(input) {
  const parts = String(input)
    .split("+")
    .map((s) => s.trim());
  if (!parts.length || parts.some((p) => !/^[0-9]+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => n < 1)) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  if (sum < MIN_BEATS || sum > MAX_BEATS) return null;
  return nums.flatMap((n) => ["accent", ...Array(n - 1).fill("normal")]);
}

/* Wraps at musical group boundaries, derived from where the accents fall. */
export function rowsFromBeats(beats) {
  const accents = beats.flatMap((b, i) => (b === "accent" ? [i] : []));
  let sizes;
  /* Group rows only while they stay readable — past six rows the accent
     pattern is clearer on even rows than on one row per group. */
  if (accents.length > 1 && accents.length <= 6 && accents[0] === 0) {
    sizes = accents.map(
      (a, i) => (i + 1 < accents.length ? accents[i + 1] : beats.length) - a,
    );
  } else if (beats.length <= 8) {
    sizes = [beats.length];
  } else {
    const rows = Math.ceil(beats.length / 8);
    const per = Math.ceil(beats.length / rows);
    sizes = [];
    for (let left = beats.length; left > 0; left -= per) {
      sizes.push(Math.min(per, left));
    }
  }
  const out = [];
  let i = 0;
  for (const size of sizes) {
    out.push(beats.slice(i, i + size).map((st, j) => ({ st, index: i + j })));
    i += size;
  }
  return out;
}
