import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { parseHash, serializeHash } from "./helpers/core.js";

const DEFAULTS = {
  bpm: 100,
  beats: ["accent", "normal", "normal", "normal"],
  sub: 1,
  swing: 50,
};

describe("share", () => {
  it("falls back to the default pattern", () => {
    assert.deepEqual(parseHash(""), DEFAULTS);
    assert.deepEqual(parseHash("#"), DEFAULTS);
  });

  it("round-trips a state through the hash", () => {
    for (const state of [
      DEFAULTS,
      {
        bpm: 200,
        beats: ["accent", "minor", "muted", "normal"],
        sub: 4,
        swing: 67,
      },
      { bpm: 20, beats: ["accent", "normal"], sub: 8, swing: 50 },
      /* Under 50 the off-tick lands early. */
      { bpm: 88, beats: ["accent", "normal", "normal"], sub: 2, swing: 33 },
    ]) {
      assert.deepEqual(parseHash("#" + serializeHash(state)), state);
    }
  });

  it("never throws, whatever it is handed", () => {
    for (const hostile of [
      null,
      undefined,
      "#%",
      "#%zz=%zz",
      "#bpm",
      "#=1",
      "#bpm=NaN&sub=Infinity&swing=-1e9",
      "#beats=" + "X".repeat(500),
      "#groups=" + "9+".repeat(200) + "9",
      "#" + "&".repeat(1000),
      "#BPM=240&BEATS=XoXo",
    ]) {
      assert.doesNotThrow(() => parseHash(hostile), String(hostile));
    }
  });

  it("clamps every field to its range", () => {
    assert.equal(parseHash("#bpm=0").bpm, 20);
    assert.equal(parseHash("#bpm=99999").bpm, 999);
    assert.equal(parseHash("#sub=0").sub, 1);
    assert.equal(parseHash("#sub=99").sub, 8);
    assert.equal(parseHash("#swing=0").swing, 5);
    assert.equal(parseHash("#swing=100").swing, 95);
    assert.equal(parseHash("#beats=" + "o".repeat(40)).beats.length, 24);
    assert.equal(parseHash("#beats=o").beats.length, 2);
  });

  it("reads a grouping into accents", () => {
    assert.deepEqual(parseHash("#groups=3+2").beats, [
      "accent",
      "normal",
      "normal",
      "accent",
      "normal",
    ]);
  });

  it("leaves a straight pattern's swing out of the link", () => {
    assert.ok(!serializeHash({ ...DEFAULTS }).includes("swing"));
    assert.ok(serializeHash({ ...DEFAULTS, swing: 67 }).includes("swing=67"));
  });
});
