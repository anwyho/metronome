/* The bar: what each beat sounds like, how the count changes, and how the row
   of beats wraps for display. Pure. */

export type Level = "accent" | "minor" | "normal" | "muted";
export type Pattern = Level[];

/* Tapping a beat walks up from silence, so the first tap on a silent beat
   makes a sound rather than taking one away. */
const CYCLE: readonly Level[] = ["muted", "normal", "minor", "accent"];
export const GLYPH: Record<Level, string> = {
  accent: "X",
  minor: "x",
  normal: "o",
  muted: ".",
};
export const LEVEL_NAME: Record<Level, string> = {
  accent: "major accent",
  minor: "minor accent",
  normal: "beat",
  muted: "silent",
};

export const MIN_BEATS = 2;
export const MAX_BEATS = 24;

export const cycleLevel = (level: Level): Level => {
  const at = CYCLE.indexOf(level);
  return CYCLE[(at < 0 ? 0 : at + 1) % CYCLE.length]!;
};

export function cycleBeat(beats: Pattern, index: number): Pattern {
  const next = beats.slice();
  next[index] = cycleLevel(next[index]!);
  return next;
}

/* Moves the bar by `delta` beats, not by one: a held button asks for several
   at a time once it is up to speed. Returns the same array when the range is
   already at its end, so a caller can tell nothing happened. */
export function resize(beats: Pattern, delta: number): Pattern {
  const length = Math.min(
    MAX_BEATS,
    Math.max(MIN_BEATS, beats.length + Math.round(delta)),
  );
  if (length === beats.length) return beats;
  if (length < beats.length) return beats.slice(0, length);
  return [...beats, ...Array<Level>(length - beats.length).fill("normal")];
}

/* "3+3+2" — a sum of group lengths, each group starting on an accent. */
export function parseGrouping(input: unknown): Pattern | null {
  const parts = String(input)
    .split("+")
    .map((s) => s.trim());
  if (!parts.length || parts.some((p) => !/^[0-9]+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => n < 1)) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  if (sum < MIN_BEATS || sum > MAX_BEATS) return null;
  return nums.flatMap((n): Pattern => [
    "accent",
    ...Array<Level>(n - 1).fill("normal"),
  ]);
}

/* One beat, and where it sits in the bar the row was cut from. */
export interface BeatCell {
  st: Level;
  index: number;
}

/* Wraps at musical group boundaries, derived from where the accents fall. */
export function rowsFromBeats(beats: Pattern): BeatCell[][] {
  const accents = beats.flatMap((b, i) => (b === "accent" ? [i] : []));
  let sizes: number[];
  /* Group rows only while they stay readable — past six rows the accent
     pattern is clearer on even rows than on one row per group. */
  if (accents.length > 1 && accents.length <= 6 && accents[0] === 0) {
    sizes = accents.map(
      (a, i) => (i + 1 < accents.length ? accents[i + 1]! : beats.length) - a,
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
  const out: BeatCell[][] = [];
  let i = 0;
  for (const size of sizes) {
    out.push(beats.slice(i, i + size).map((st, j) => ({ st, index: i + j })));
    i += size;
  }
  return out;
}
