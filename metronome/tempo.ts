/* Tempo: what a tapped rhythm means, and what to call the result. Pure. */

const MIN_BPM = 20;
const MAX_BPM = 999;

const MARKS: [limit: number, name: string][] = [
  [60, "Largo"],
  [76, "Adagio"],
  [108, "Andante"],
  [120, "Moderato"],
  [168, "Allegro"],
  [Infinity, "Presto"],
];

export const clampBpm = (bpm: number): number =>
  Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));

export function tempoMarking(bpm: number): string {
  for (const [hi, name] of MARKS) if (bpm < hi) return name;
  return "Presto";
}

/* Rolling mean of the last four intervals. A gap far longer than the running
   mean is someone starting again rather than a slower tempo, so it clears the
   buffer; a single interval well off the mean is a slip, so it is dropped. */
export function tapTempo(times: number[]): number | null {
  if (times.length < 2) return null;
  let buf: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const d = times[i]! - times[i - 1]!;
    const mean = buf.length
      ? buf.reduce((a, b) => a + b, 0) / buf.length
      : null;
    if (d > (mean === null ? 2000 : Math.min(2000, 2.5 * mean))) {
      buf = [];
      continue;
    }
    if (mean !== null && Math.abs(d - mean) / mean > 0.4) continue;
    buf.push(d);
    if (buf.length > 4) buf.shift();
  }
  if (!buf.length) return null;
  return clampBpm(60000 / (buf.reduce((a, b) => a + b, 0) / buf.length));
}
