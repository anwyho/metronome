/* The pattern as a URL hash, so a link carries a setup. Never throws: the
   input is whatever was in someone's address bar. */

import { GLYPH, MAX_BEATS, MIN_BEATS, parseGrouping } from "./pattern.js";
import { MAX_BPM, MIN_BPM, clampBpm } from "./tempo.js";
import { STRAIGHT, clampSwing } from "./swing.js";

/* What a first visit opens on — a five-beat bar with a minor accent on the
   fourth, so the grid arrives showing what the levels are for rather than four
   identical dots. */
export const DEFAULTS = {
  bpm: 130,
  beats: ["accent", "normal", "normal", "minor", "normal"],
  sub: 1,
  swing: STRAIGHT,
};

const MAX_SUB = 8;
const FROM_GLYPH = {
  X: "accent",
  x: "minor",
  ".": "muted",
  o: "normal",
  O: "normal",
};

export function parseHash(hash) {
  const out = { ...DEFAULTS, beats: [...DEFAULTS.beats] };
  const raw = String(hash ?? "").replace(/^#/, "");
  if (!raw) return out;

  const kv = {};
  for (const part of raw.split("&")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    try {
      kv[decodeURIComponent(part.slice(0, i)).toLowerCase()] =
        decodeURIComponent(part.slice(i + 1));
    } catch {}
  }

  if (kv.bpm !== undefined) {
    const n = parseFloat(kv.bpm);
    if (Number.isFinite(n)) out.bpm = clampBpm(n);
  }
  if (kv.groups !== undefined) {
    const grouping = parseGrouping(kv.groups);
    if (grouping) out.beats = grouping;
  }
  if (kv.beats !== undefined && /^[XxOo.]+$/.test(kv.beats)) {
    const beats = [...kv.beats].map((c) => FROM_GLYPH[c]).slice(0, MAX_BEATS);
    while (beats.length < MIN_BEATS) beats.push("normal");
    out.beats = beats;
  }
  if (kv.sub !== undefined) {
    const n = parseFloat(kv.sub);
    out.sub = Number.isFinite(n)
      ? Math.min(MAX_SUB, Math.max(1, Math.round(n)))
      : 1;
  }
  if (kv.swing !== undefined) {
    const n = parseFloat(kv.swing);
    out.swing = Number.isFinite(n) ? clampSwing(n) : STRAIGHT;
  }
  return out;
}

export function serializeHash(state) {
  const beats = state.beats.map((b) => GLYPH[b]).join("");
  let hash = `bpm=${Math.round(state.bpm)}&beats=${beats}&sub=${state.sub}`;
  /* A straight pattern is the default, so saying so only lengthens the link. */
  if (state.swing !== STRAIGHT) hash += `&swing=${state.swing}`;
  return hash;
}

export { MIN_BPM, MAX_BPM, MAX_SUB };
