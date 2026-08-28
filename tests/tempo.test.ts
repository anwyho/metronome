import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { tapTempo, tempoMarking } from "../metronome/tempo.js";

const at = (...gaps: number[]): number[] =>
  gaps.reduce<number[]>((ts, g) => [...ts, ts.at(-1)! + g], [0]);

describe("tap tempo", () => {
  it("needs two taps before it says anything", () => {
    assert.equal(tapTempo([]), null);
    assert.equal(tapTempo([0]), null);
    assert.equal(tapTempo(at(500)), 120);
  });

  it("averages a steady tap", () => {
    assert.equal(tapTempo(at(500, 500, 500)), 120);
    assert.equal(tapTempo(at(400, 400, 400, 400)), 150);
  });

  it("ignores a tap that misses the beat", () => {
    /* 80% out is a slip, not a new tempo. */
    assert.equal(tapTempo(at(500, 500, 900, 500)), 120);
  });

  it("starts over after a pause rather than averaging across it", () => {
    assert.equal(tapTempo(at(500, 500, 4000, 400, 400)), 150);
  });

  it("stays inside the tempo range", () => {
    assert.equal(tapTempo(at(10, 10, 10)), 999);
    assert.equal(tapTempo(at(1900, 1900)), 32);
  });
});

describe("tempo marking", () => {
  it("names the tempo", () => {
    assert.equal(tempoMarking(40), "Largo");
    assert.equal(tempoMarking(60), "Adagio");
    assert.equal(tempoMarking(100), "Andante");
    assert.equal(tempoMarking(120), "Allegro");
    assert.equal(tempoMarking(600), "Presto");
  });
});
