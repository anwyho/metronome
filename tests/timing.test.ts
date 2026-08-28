import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { reanchor, spt, tickAtTime, timeAtTick } from "../metronome/timing.js";

const AT_ZERO = { tick: 0, time: 0 };

describe("timing", () => {
  it("round-trips a tick through its time", () => {
    for (const swing of [50, 67, 25]) {
      for (let k = 0; k < 16; k++) {
        const t = timeAtTick(k, AT_ZERO, 120, 4, swing);
        assert.equal(tickAtTime(t + 1e-9, AT_ZERO, 120, 4, swing), k);
      }
    }
  });

  it("splits the pair long-short in proportion to the swing", () => {
    const s = spt(120, 2);
    assert.equal(timeAtTick(1, AT_ZERO, 120, 2, 75), 0.75 * 2 * s);
    assert.equal(timeAtTick(1, AT_ZERO, 120, 2, 25), 0.25 * 2 * s);
    assert.equal(timeAtTick(2, AT_ZERO, 120, 2, 25), 2 * s);
  });

  it("takes the converted tick when the conversion names a whole one", () => {
    const next = reanchor(
      { now: 0.6, anchor: AT_ZERO, bpm: 120, sub: 8, swing: 50 },
      { bpm: 120, sub: 4, swing: 50 },
    );
    /* Tick 10 of an eight-per-beat grid is beat 1.25, which is tick 5 of a
       four-per-beat one exactly. Nothing has to move. */
    assert.deepEqual(next.anchor, { tick: 5, time: 0.625 });
    assert.equal(next.sub, 4);
  });

  it("waits for the next beat when the conversion falls between ticks", () => {
    const next = reanchor(
      { now: 0.6, anchor: AT_ZERO, bpm: 120, sub: 8, swing: 50 },
      { bpm: 120, sub: 3, swing: 50 },
    );
    /* Beat 1.25 has no name in a three-per-beat grid, and rounding to the
       nearest one moves the beat itself. Beat 2 is the position both grids
       agree on. */
    assert.deepEqual(next.anchor, { tick: 6, time: 1 });
    assert.equal(next.anchor.tick % 3, 0, "landed on a downbeat");
  });

  it("re-anchors a straight transport on the next tick", () => {
    const next = reanchor(
      { now: 0.6, anchor: AT_ZERO, bpm: 120, sub: 8, swing: 50 },
      { bpm: 140, sub: 8, swing: 50 },
    );
    assert.deepEqual(next.anchor, { tick: 10, time: 0.625 });
    assert.equal(next.bpm, 140);
    assert.ok(next.anchor.time > 0.6, "never behind the transport");
  });

  it("re-anchors a swinging transport on a pair boundary", () => {
    const next = reanchor(
      { now: 0.6, anchor: AT_ZERO, bpm: 120, sub: 2, swing: 67 },
      { bpm: 140, sub: 2, swing: 67 },
    );
    assert.equal(next.anchor.tick % 2, 0, "a swung pair is never split");
    assert.ok(next.anchor.time > 0.6, "never behind the transport");
  });

  it("takes the swing it is given, not the one the worklet is playing", () => {
    /* Dragging the clicks-per-beat slider from 2 to 4 passes through 3, where
       swing cannot apply and the worklet is told 50. Landing on 4 has to bring
       the player's setting back, and the only place it survives is the target
       handed in here. */
    const straightened = {
      now: 0.6,
      anchor: AT_ZERO,
      bpm: 120,
      sub: 3,
      swing: 50,
    };
    const next = reanchor(straightened, { bpm: 120, sub: 4, swing: 67 });
    assert.equal(next.swing, 67);
  });

  it("drops swing when the subdivision cannot carry it", () => {
    const next = reanchor(
      { now: 0.6, anchor: AT_ZERO, bpm: 120, sub: 2, swing: 67 },
      { bpm: 120, sub: 3, swing: 67 },
    );
    assert.equal(next.swing, 50);
  });
});
