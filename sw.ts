/* The worker for this app: configuration, and the runtime that reads it.

   The block below is a permanent placeholder. `npm run build` regenerates
   `dist/sw.js` from scratch and `tools/build.mjs` writes the real values there,
   never into this source, so editing them here does nothing.

   VERSION is the calendar date, for humans. BUILD hashes every precached byte
   and the precache list, and is what actually keys the cache: two deploys on
   one day share a VERSION, so keying on it would leave this file identical and
   the update would never ship. `pwa/sw-runtime.js` is precached, so editing
   how responses are served rekeys the cache too. */

/* @generated-begin */
const VERSION = "0";
const BUILD = "0";
const PRECACHE: string[] = [];
/* @generated-end */

importScripts("pwa/sw-runtime.js");

offlineWorker({
  version: VERSION,
  build: BUILD,
  precache: PRECACHE,
  cachePrefix: "metronome-",
});
