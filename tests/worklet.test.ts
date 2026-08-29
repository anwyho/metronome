import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { createWorklet } from "./helpers/worklet.js";
import { reanchor } from "../metronome/timing.js";
import type { Pattern } from "../metronome/pattern.js";

const PATTERN: Pattern = ["accent", "normal", "normal", "normal"];
const BPM = 120;
const BEAT = 60 / BPM;
const BAR = PATTERN.length * BEAT;
const START = { tick: 0, time: 0.05 };

function running(sub: number, swing = 50) {
  const w = createWorklet();
  w.send({
    type: "start",
    anchor: START,
    bpm: BPM,
    subdivision: sub,
    swing,
    pattern: PATTERN,
  });
  return w;
}

const within = (t: number, period: number) => {
  const m = ((t % period) + period) % period;
  return Math.min(m, period - m);
};

describe("worklet", () => {
  it("clicks once per subdivision, for every subdivision", () => {
    for (let sub = 1; sub <= 8; sub++) {
      const w = running(sub);
      w.advance(BAR + START.time);
      const inBar = w.clicks.filter((c) => c.time < START.time + BAR - 1e-6);
      assert.equal(
        inBar.length,
        PATTERN.length * sub,
        `subdivision ${sub} should click ${PATTERN.length * sub} times a bar`,
      );

      for (let beat = 0; beat < PATTERN.length; beat++) {
        const from = START.time + beat * BEAT;
        const onBeat = inBar.filter(
          (c) => c.time >= from - 1e-6 && c.time < from + BEAT - 1e-6,
        );
        assert.equal(onBeat.length, sub, `subdivision ${sub}, beat ${beat}`);
      }
    }
  });

  it("places the accent exactly one bar apart", () => {
    for (let sub = 1; sub <= 8; sub++) {
      const w = running(sub);
      w.advance(4 * BAR);
      const accents = w.clicks.filter((c) => c.voice === "accent");
      assert.ok(accents.length >= 3, `subdivision ${sub} produced accents`);
      accents.forEach((a, i) => {
        assert.ok(
          Math.abs(a.time - (START.time + i * BAR)) < 1e-6,
          `subdivision ${sub}, accent ${i} at ${a.time}`,
        );
      });
    }
  });

  it("keeps every beat on the grid through an aggressive subdivision drag", () => {
    const w = running(1);
    let from = { anchor: START, bpm: BPM, sub: 1, swing: 50 };

    for (const sub of [2, 3, 4, 5, 6, 7, 8, 7, 5, 3, 8, 2, 6, 1, 4, 8]) {
      w.advance(0.07);
      const next = reanchor(
        { ...from, now: w.time },
        { bpm: BPM, sub, swing: 50 },
      );
      if (!next) continue;
      w.send({
        type: "reanchor",
        anchor: next.anchor,
        bpm: next.bpm,
        subdivision: next.sub,
        swing: next.swing,
        applyAtTime: next.anchor.time,
      });
      from = next;
    }
    w.advance(3);

    const beats = w.clicks.filter((c) => c.voice !== "sub");
    assert.ok(beats.length > 8, "the drag produced beats to check");
    for (const b of beats) {
      assert.ok(
        within(b.time - START.time, BEAT) < w.quantum,
        `beat click at ${b.time} is off the ${BEAT}s grid`,
      );
    }
    for (const a of w.clicks.filter((c) => c.voice === "accent")) {
      assert.ok(
        within(a.time - START.time, BAR) < w.quantum,
        `accent at ${a.time} left the downbeat`,
      );
    }
  });

  it("keeps the swing across a drag that passes through an odd subdivision", () => {
    const w = running(2, 67);
    let from = { anchor: START, bpm: BPM, sub: 2, swing: 67 };
    /* 2 to 4 on the slider goes through 3, where swing cannot apply. */
    for (const sub of [3, 4]) {
      w.advance(0.3);
      const next = reanchor(
        { ...from, now: w.time },
        { bpm: BPM, sub, swing: 67 },
      );
      w.send({
        type: "reanchor",
        anchor: next.anchor,
        bpm: next.bpm,
        subdivision: next.sub,
        swing: next.swing,
        applyAtTime: next.anchor.time,
      });
      from = next;
    }
    w.advance(2 * BEAT);

    /* Four per beat swung to 67 is two pairs, each split roughly two to one. A
       straight grid would have put every click the same distance apart, so the
       ratio between the gaps is the whole assertion. */
    const tail = w.clicks.slice(-5);
    const gaps = tail.slice(1).map((c, i) => c.time - tail[i]!.time);
    const ratio = Math.max(...gaps) / Math.min(...gaps);
    assert.ok(
      ratio > 1.8 && ratio < 2.2,
      `expected a long-short split, got gaps ${gaps.map((g) => g.toFixed(4))}`,
    );
  });

  it("places the off-tick early when swing is under 50", () => {
    const w = running(2, 25);
    w.advance(2 * BEAT);
    const [first, off, second] = w.clicks;
    assert.equal(off!.voice, "sub");
    /* The pair is one beat; a quarter swing splits it a quarter of the way in
       rather than halfway, which is the whole point of reverse swing. */
    assert.ok(Math.abs(off!.time - (first!.time + 0.25 * BEAT)) < 1e-6);
    assert.ok(Math.abs(second!.time - (first!.time + BEAT)) < 1e-6);
  });

  it("re-levels on the next tick but waits for the downbeat to resize", () => {
    /* Same length: the bar keeps its shape, so the change lands immediately. */
    const w = running(1);
    w.advance(START.time + 1.5 * BEAT);
    w.send({
      type: "pattern",
      pattern: ["accent", "normal", "muted", "muted"],
    });
    w.advance(3 * BEAT);
    const rest = w.clicks.filter(
      (c) =>
        c.time > w.time - 3 * BEAT && c.time < START.time + 4 * BEAT - 1e-6,
    );
    assert.deepEqual(
      rest,
      [],
      "the silenced beats went silent on the next tick",
    );

    /* A different length re-indexes every beat under a listener already inside
       the bar, so it holds until the downbeat they are counting toward. */
    const w2 = running(1);
    w2.advance(START.time + 1.5 * BEAT);
    w2.send({ type: "pattern", pattern: ["muted", "muted", "muted"] });
    w2.advance(4 * BEAT);
    const last = w2.clicks.at(-1);
    assert.ok(
      Math.abs(last!.time - (START.time + 3 * BEAT)) < 1e-6,
      `the bar ran to its end before going silent, last click at ${last!.time}`,
    );
  });
});
