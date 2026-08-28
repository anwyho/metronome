/* The main thread's mirror of the worklet's tick grid, and the one calculation
   that keeps a live change from moving the beat. Pure — no audio context, no
   state; `now` is passed in. */

/* Seconds per tick. */
export const spt = (bpm, sub) => 60 / bpm / sub;

/* Ticks run in pairs and swing moves the second of each pair, so a tick's time
   is its pair's start plus, for an odd tick, the swung fraction of the pair. */
export function timeAtTick(k, anchor, bpm, sub, swing) {
  const s = spt(bpm, sub);
  const p = Math.floor(k / 2);
  const q = k - 2 * p;
  const offset = q === 0 ? 0 : (swing / 100) * 2 * s;
  return anchor.time + (2 * p - anchor.tick) * s + offset;
}

/* The last tick that has sounded at time `t`. */
export function tickAtTime(t, anchor, bpm, sub, swing) {
  const rel = tickPosition(t, anchor, bpm, sub);
  const p = Math.floor(rel / 2);
  const frac = (rel - 2 * p) / 2;
  return 2 * p + (frac < swing / 100 ? 0 : 1);
}

/* Where the transport is, as a fraction of a tick. */
export function tickPosition(t, anchor, bpm, sub) {
  return anchor.tick + (t - anchor.time) / spt(bpm, sub);
}

/* How far ahead of the current instant a change is allowed to land. Short
   enough not to be felt, long enough that the worklet is never handed an
   anchor it has already passed. */
const LEAD = 0.02;

/* Re-bases the grid for a change of tempo, subdivision or swing.
   `from` is the transport as the worklet currently understands it, plus the
   `now` to measure against; `next` is the change. Returns what to send. */
export function reanchor(from, next) {
  const { anchor, bpm: oldBpm, sub: oldSub, swing: oldSwing } = from;
  const bpm = next.bpm ?? from.bpm;
  const sub = next.sub ?? from.sub;
  const swing = swingApplies(sub) ? (next.swing ?? from.swing) : 50;

  /* The fractional position, not the tick it last sounded: rounding down and
     taking that tick's pair lands on a tick already played, and the worklet,
     told to resume there, plays it again. */
  const now = tickPosition(from.now + LEAD, anchor, oldBpm, oldSub);
  /* Swing splits a pair long-short, so a swinging transport can only be
     re-anchored on a pair boundary or the split moves. A straight one has no
     phase to keep and takes the very next tick. */
  const step = oldSwing === 50 ? 1 : 2;
  let tick = step * Math.ceil(now / step);
  let time = timeAtTick(tick, anchor, oldBpm, oldSub, oldSwing);

  if (sub !== oldSub) {
    /* Rounding a converted anchor to the nearest tick moves the beat itself —
       eight-per-beat tick 50 is beat 6.25, which four-per-beat cannot name,
       and rounding it stacks a quarter-beat error every time the slider moves.
       Take the conversion when it lands on a whole tick, which is most of the
       time and costs nothing; otherwise wait for the next beat, the one
       position both grids agree on. */
    const exact = (tick / oldSub) * sub;
    const whole = Math.round(exact);
    if (Math.abs(exact - whole) < 1e-9 && (swing === 50 || whole % 2 === 0)) {
      tick = whole;
    } else {
      const beat = Math.ceil(now / oldSub);
      tick = beat * sub;
      time = timeAtTick(beat * oldSub, anchor, oldBpm, oldSub, oldSwing);
    }
  }

  return { anchor: { tick, time }, bpm, sub, swing };
}

/* Swing splits a tick pair long-short, so it only means anything when the
   clicks per beat divide into pairs — even subdivisions. */
export const swingApplies = (sub) => sub >= 2 && sub % 2 === 0;

/* A frame computed now reaches the screen a frame or two later, which reads as
   the dot lighting behind the click. Read the schedule slightly ahead to cover
   the trip, capped at a quarter tick so a fast subdivision cannot be nudged
   onto the next one. */
export const visualLead = (bpm, sub) => Math.min(0.05, 15 / (bpm * sub));
