/* The worker for this app: configuration, and the runtime that reads it.

   The block below is generated — run `node tools/build.mjs` after changing any
   shipped file. `node tools/build.mjs --check` fails if stale.

   VERSION is the calendar date, for humans. BUILD hashes every precached byte
   and the precache list, and is what actually keys the cache: two deploys on
   one day share a VERSION, so keying on it would leave this file identical and
   the update would never ship. `pwa/sw-runtime.js` is precached, so editing
   how responses are served rekeys the cache too. */

/* @generated-begin */
const VERSION = "260828.1121";
const BUILD = "750a77bc1e08";
const PRECACHE = [
  "./",
  "fonts/caprasimo-latin.woff2",
  "fonts/figtree-latin.woff2",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "manifest.webmanifest",
  "metronome/engine.js",
  "metronome/pattern.js",
  "metronome/prefs.js",
  "metronome/share.js",
  "metronome/store.js",
  "metronome/swing.js",
  "metronome/tempo.js",
  "metronome/timing.js",
  "metronome/worklet.js",
  "pwa/install.js",
  "pwa/register.js",
  "pwa/sw-runtime.js",
  "pwa/theme.js",
  "pwa/updates.js",
  "styles/app.css",
  "styles/base.css",
  "styles/tokens.css",
  "ui/App.js",
  "ui/components/BeatGrid.js",
  "ui/components/CountInButton.js",
  "ui/components/HoldButton.js",
  "ui/components/InstallHint.js",
  "ui/components/SettingsPanel.js",
  "ui/components/ShareButton.js",
  "ui/components/SubdivisionControl.js",
  "ui/components/SwingControl.js",
  "ui/components/TempoControl.js",
  "ui/components/ThemeToggle.js",
  "ui/components/Transport.js",
  "ui/components/UpdateRow.js",
  "ui/components/VolumeControl.js",
  "ui/hold-repeat.js",
  "ui/hooks/useHoldRepeat.js",
  "ui/hooks/useServiceWorker.js",
  "ui/hooks/useStore.js",
  "ui/hooks/useTheme.js",
  "ui/hooks/useViewport.js",
  "ui/html.js",
  "ui/layout.js",
  "ui/main.js",
  "vendor/hooks.module.js",
  "vendor/htm.module.js",
  "vendor/preact.module.js",
];
/* @generated-end */

importScripts("pwa/sw-runtime.js");

offlineWorker({
  version: VERSION,
  build: BUILD,
  precache: PRECACHE,
  cachePrefix: "metronome-",
});
