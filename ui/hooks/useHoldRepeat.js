import { useEffect, useRef } from "../../vendor/hooks.module.js";
import { stepsAfter } from "../hold-repeat.js";

/* Press-and-hold. The press itself is always worth exactly one step, so a tap
   moves one and nothing else; repeating starts after the delay and accelerates
   from there.

   Driven by rAF rather than a timer, because the rate is a curve rather than
   an interval, and because a frame is the finest the number can be read at
   anyway. The pointer is deliberately not captured — leaving the button has to
   stop the repeat, and a captured pointer never leaves. */
export function useHoldRepeat(onStep) {
  const held = useRef(null);

  const stop = () => {
    if (!held.current) return;
    cancelAnimationFrame(held.current.frame);
    held.current = null;
  };

  useEffect(() => stop, []);

  const start = () => {
    stop();
    onStep(1);
    const state = { at: performance.now(), applied: 0, frame: 0 };
    const tick = () => {
      const want = stepsAfter((performance.now() - state.at) / 1000);
      if (want > state.applied) {
        onStep(want - state.applied);
        state.applied = want;
      }
      state.frame = requestAnimationFrame(tick);
    };
    state.frame = requestAnimationFrame(tick);
    held.current = state;
  };

  return {
    onPointerDown: start,
    onPointerUp: stop,
    onPointerCancel: stop,
    onPointerLeave: stop,
    /* A click with no pointer behind it is the keyboard activating the button,
       and that never went through onPointerDown. */
    onClick: (e) => {
      if (e.detail === 0) onStep(1);
    },
  };
}
