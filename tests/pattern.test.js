import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  cycleLevel,
  parseGrouping,
  resize,
  rowsFromBeats,
} from "../metronome/pattern.js";

const sizes = (beats) => rowsFromBeats(beats).map((r) => r.length);
const flat = (beats) =>
  rowsFromBeats(beats)
    .flat()
    .map((c) => c.index);
const beats = (n, level = "normal") => Array.from({ length: n }, () => level);
const grouped = (...ns) => ns.flatMap((n) => ["accent", ...beats(n - 1)]);

describe("grouping", () => {
  it("turns a sum into accents", () => {
    assert.deepEqual(parseGrouping("3+2"), grouped(3, 2));
    assert.deepEqual(parseGrouping(" 2 + 2 + 3 "), grouped(2, 2, 3));
  });

  it("rejects anything that is not a sum of beats", () => {
    for (const bad of [
      "",
      "x",
      "3+",
      "+3",
      "3+0",
      "1",
      "0",
      "25",
      "13+13",
      "3.5",
      "-3",
    ])
      assert.equal(parseGrouping(bad), null, bad);
  });
});

describe("rows", () => {
  it("wraps on the accents when they read as groups", () => {
    assert.deepEqual(sizes(grouped(3, 3, 2)), [3, 3, 2]);
    assert.deepEqual(sizes(grouped(2, 2)), [2, 2]);
  });

  it("keeps a short bar on one row", () => {
    assert.deepEqual(sizes(["accent", ...beats(3)]), [4]);
    assert.deepEqual(sizes(["accent", ...beats(7)]), [8]);
  });

  it("splits evenly once the accents stop being a guide", () => {
    /* Seven groups is more rows than the accent pattern is worth reading off,
       and past eight beats a single row stops fitting. */
    assert.deepEqual(sizes(grouped(2, 2, 2, 2, 2, 2, 2)), [7, 7]);
    assert.deepEqual(sizes(["accent", ...beats(11)]), [6, 6]);
    assert.deepEqual(sizes(["accent", ...beats(23)]), [8, 8, 8]);
  });

  it("never loses or reorders a beat", () => {
    for (let n = 2; n <= 24; n++) {
      const pattern = ["accent", ...beats(n - 1)];
      assert.deepEqual(
        flat(pattern),
        pattern.map((_, i) => i),
        `${n} beats`,
      );
    }
  });
});

describe("resizing", () => {
  const bar = (n) => ["accent", ...beats(n - 1)];

  it("moves by as many beats as it is asked for", () => {
    assert.equal(resize(bar(4), 1).length, 5);
    assert.equal(resize(bar(4), 6).length, 10);
    assert.equal(resize(bar(12), -5).length, 7);
  });

  it("keeps the beats it is not removing", () => {
    const before = ["accent", "minor", "muted", "normal", "accent"];
    assert.deepEqual(resize(before, -2), before.slice(0, 3));
    assert.deepEqual(resize(before, 2), [...before, "normal", "normal"]);
  });

  it("stops at the ends, and says so by not moving", () => {
    const full = bar(24);
    assert.equal(resize(full, 5), full, "the same array back");
    assert.equal(resize(bar(20), 9).length, 24);
    const smallest = bar(2);
    assert.equal(resize(smallest, -3), smallest);
    assert.equal(resize(bar(5), -9).length, 2);
  });
});

describe("levels", () => {
  it("cycles silent to beat to minor to accent and back", () => {
    assert.equal(cycleLevel("muted"), "normal");
    assert.equal(cycleLevel("normal"), "minor");
    assert.equal(cycleLevel("minor"), "accent");
    assert.equal(cycleLevel("accent"), "muted");
  });
});
