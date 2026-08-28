import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  HOLD_DELAY,
  MAX_RATE,
  MIN_RATE,
  stepsAfter,
} from "../ui/hold-repeat.js";

describe("hold repeat", () => {
  it("counts nothing until the hold is unambiguously a hold", () => {
    assert.equal(stepsAfter(0), 0);
    assert.equal(stepsAfter(HOLD_DELAY / 2), 0);
    assert.equal(stepsAfter(HOLD_DELAY), 0);
  });

  it("starts one step at a time", () => {
    /* The first repeat has to be a single step, or a press meant as a nudge
       jumps. At the opening rate that is a quarter of a second in. */
    const first = HOLD_DELAY + 1 / MIN_RATE;
    assert.equal(stepsAfter(first - 0.01), 0);
    assert.equal(stepsAfter(first + 0.01), 1);
    /* A second of holding is still a nudge, not a journey. */
    const afterASecond = stepsAfter(HOLD_DELAY + 1);
    assert.ok(
      afterASecond >= MIN_RATE && afterASecond <= 10,
      `${afterASecond} steps in the first second of repeating`,
    );
  });

  it("never goes backwards", () => {
    let previous = 0;
    for (let t = 0; t < 20; t += 1 / 240) {
      const steps = stepsAfter(t);
      assert.ok(steps >= previous, `${steps} at ${t}s followed ${previous}`);
      previous = steps;
    }
  });

  it("accelerates, and then holds the ceiling", () => {
    const over = (a, b) => stepsAfter(b) - stepsAfter(a);
    const early = over(HOLD_DELAY, HOLD_DELAY + 1);
    const later = over(HOLD_DELAY + 2, HOLD_DELAY + 3);
    assert.ok(later > early * 2, `${later} should far outpace ${early}`);

    const atCeiling = over(HOLD_DELAY + 10, HOLD_DELAY + 11);
    assert.ok(
      Math.abs(atCeiling - MAX_RATE) <= 1,
      `${atCeiling} steps a second`,
    );
    assert.equal(over(HOLD_DELAY + 20, HOLD_DELAY + 21), atCeiling);
  });

  it("crosses the whole tempo range in a press somebody would actually hold", () => {
    const seconds = [...Array(300).keys()]
      .map((i) => HOLD_DELAY + i / 10)
      .find((t) => stepsAfter(t) >= 999 - 20);
    assert.ok(seconds, "the range is reachable at all");
    assert.ok(
      seconds - HOLD_DELAY < 12,
      `took ${(seconds - HOLD_DELAY).toFixed(1)}s`,
    );
  });
});
