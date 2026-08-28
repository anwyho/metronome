/* The seam between the tests and the domain code. Everything the unit tests
   touch is reached through here, so the tests keep asserting the same
   behaviour while the code underneath moves out of `metronome-core.js` and
   into modules. */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE = readFileSync(join(ROOT, "metronome-core.js"), "utf8");

/* Evaluated in this realm rather than a `vm` context: the state it hands back
   is compared with deepEqual, and an object from another realm has another
   realm's prototype, which deepEqual counts as a difference. */
const host = {};
new Function("window", SOURCE)(host);

const Core = host.MetronomeCore;

/* The worklet ships as a string that is compiled by the audio thread, so the
   only way to reach it from here is to lift it back out of its source. */
export const WORKLET_SRC = SOURCE.match(
  /const WORKLET_SRC = `([\s\S]*?)`;\n/,
)[1];

export const {
  parseHash,
  serializeHash,
  parseGrouping,
  rowsFromBeats,
  tapTempo,
  tempoMarking,
  swingApplies,
  CYCLE,
  PRESETS,
} = Core;

const timing = new Core.Controller({ forceUpdate() {} }, {});

export const spt = (bpm, sub) => timing.spt(bpm, sub);
export const timeAtTick = (k, anchor, bpm, sub, swing) =>
  timing.timeAtTick(k, anchor, bpm, sub, swing);
export const tickAtTime = (t, anchor, bpm, sub, swing) =>
  timing.tickAtTime(t, anchor, bpm, sub, swing);

/* `from` is the transport as the worklet currently understands it; `next` is
   the change being asked for. Returns what the worklet would be told, or null
   if nothing would be sent. */
export function reanchor(from, next) {
  const ctl = new Core.Controller({ forceUpdate() {} }, {});
  let sent = null;
  ctl.ctx = { currentTime: from.now };
  ctl.node = {
    port: {
      postMessage(m) {
        if (m.type === "reanchor") sent = m;
      },
    },
  };
  ctl.s.running = true;
  ctl.a = from.anchor;
  ctl.abpm = from.bpm;
  ctl.asub = from.sub;
  ctl.aswing = from.swing;
  Object.assign(ctl.s, { bpm: from.bpm, sub: from.sub, swing: from.swing });
  ctl.reanchor(next);
  return (
    sent && {
      anchor: sent.anchor,
      bpm: sent.bpm,
      sub: sent.subdivision,
      swing: sent.swing,
    }
  );
}

/* The cycle a tap through a beat cell follows. */
export function cycleLevel(level) {
  const at = CYCLE.indexOf(level);
  return CYCLE[(at < 0 ? 0 : at + 1) % CYCLE.length];
}
