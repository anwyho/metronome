# Refactor brief: make this a reusable PWA template

## What this repo is today

`github.com/anwyho/metronome` — an offline-first metronome PWA on Cloudflare
Workers (Static Assets) at https://a.aaanth.com/metronome/. `README.md`
documents the update mechanism, theming, audio session and provenance and is
accurate as of commit 9c73733.

## Goal

Restructure so the PWA machinery is a clean, reusable, well-tested skeleton and
the metronome is just the app that happens to sit inside it. Optimise for
readability, extensibility, and the smallest sensible deploy payload. No
minification. Simplify wherever the code allows it, and hold to ordinary
frontend practice — real components, styles in stylesheets, pure logic
separated from effects.

## Where it stands (measured, not guessed)

241KB precached across 15 files:

|                     |                                |
| ------------------- | ------------------------------ |
| `support.js`        | 69KB / 1911 lines              |
| `metronome-core.js` | 32KB / 927 lines               |
| `index.html`        | 32KB / 420 lines               |
| fonts               | 41KB (2 woff2, latin subset)   |
| preact vendor       | 27KB (preact + hooks + compat) |
| `ds/styles.css`     | 16KB                           |
| icons               | 32KB                           |

No package.json, no bundler, no tests, no lint. "The whole app is plain files"
is a deliberate, stated property — see README "Run it".

## The central problem

`support.js` is the Claude Design canvas runtime, vendored unmodified. The
entire UI is an `<x-dc>` HTML template with `{{ }}` holes it compiles at
runtime, plus a `<script type="text/x-dc">` block inside `index.html` holding
the component class and ~200 lines of inline style-string concatenation.

Consequences: the UI cannot be componentised, styles are unreadable string soup,
nothing is unit-testable, and 69KB (29% of the payload) is a general template
engine driving one page. Preact is already vendored and `index.html` already
aliases React to preact/compat.

Replacing this runtime with plain Preact components is the single highest-value
change: it deletes ~69KB, lets preact-compat go too (~11KB), and unlocks every
other goal. Do it first and the rest follows.

## Workstreams

1. **Replace the canvas runtime with Preact components.** Break the UI into real
   components (BeatGrid, TempoControl, Transport, SettingsPanel, SwingControl,
   ThemeToggle, UpdateRow…). Move style strings into CSS against the existing
   design tokens. Delete `support.js` and preact-compat.

2. **Extract the PWA layer into a documented, reusable module.** Currently spread
   across `index.html` (inline theme boot), `app.js` (SW registration + update
   flow), `sw.js` (precache + fetch strategy) and `tools/build.mjs` (precache
   list + version/build stamping). Target a `pwa/` directory: service-worker
   runtime, registration + update surface, theme (system/light/dark),
   version/build stamping, install prompt, offline shell strategy. Each
   independently testable and documented well enough to lift into another
   project.

3. **Separate the metronome domain from its UI.** `metronome-core.js` mixes the
   AudioWorklet source (a template string), the scheduling and anchor maths, the
   pattern model, URL-hash serialisation, localStorage prefs, wake lock and
   keyboard handling. Split these. The scheduling maths in particular is pure and
   deserves direct unit tests.

4. **Tooling.** Add `package.json`. Weigh a bundler honestly against the current
   plain-files property, which has real value (no build to serve locally, and the
   README leans on it) — do not add one reflexively. If you do bundle, keep a
   documented no-build path. Add a test runner and a formatter/linter (Prettier
   is already the de-facto style).

5. **Payload.** Levers by size: `support.js` (69KB), preact-compat (11KB), the
   unused component classes in `ds/styles.css` (~7KB — the app uses inline styles
   and references none of `.btn`/`.card`/`.nav`/`.table`/`.dialog`), the
   Caprasimo display font (21KB, headings only), lazy-loading anything not needed
   for first paint. `_headers` already sets cache headers; check they are right.
   Precaching only the first-paint set is possible — but the offline guarantee is
   a stated feature, so do not silently weaken it.

6. **README.** Open by explaining what the project _is_ — a PWA template with a
   metronome as its reference app — and how to reuse the skeleton. Keep the
   existing mechanism docs (updates, theming, sound-and-screen, deploy); they are
   correct and were expensive to learn.

## Feature changes wanted alongside the refactor

- **Press-and-hold on the BPM − / + buttons.** A tap still moves one BPM. Holding
  starts repeating after a short delay and _accelerates_ — slow at first, then
  progressively faster, so a long press crosses the range without becoming
  uncontrollable near the start. Release, pointer-cancel and pointer-leave all
  stop it. The ramp should be a pure function of hold duration so it can be unit
  tested.
- **Widen swing to 5–95%**, from the current 50–75. Values below 50 are reverse
  swing (the off-tick lands early). This touches the slider bounds, the hash
  parser's clamp, the guide-dot positions (which are computed against the 50–75
  span today), and the named-preset lookup. The worklet's `timeAtTick` and the
  shortest-click duration cap already handle `swing < 0.5` correctly.

## Do not regress these — each was a real bug, each has a commit explaining it

- `SHELL` in `sw.js` MUST be `'./'`, not `'index.html'`. The origin 307s
  `/index.html` to the directory form, so precaching it stores a response with
  the redirect flag set, and serving that for a navigation makes iOS fail with
  "Response served by service worker has redirections" — the app will not launch
  at all. (da1e5ec)
- The worker strips the redirect flag from anything entering the cache and again
  on the way out to a navigation. `opaqueredirect` must pass through untouched —
  its body cannot be read. (6beeeaa)
- Precache is filled by hand rather than `addAll`, because `addAll` stores
  whatever a redirect resolved to. Every fetch must settle before anything is
  written, so a missing file fails the install and leaves the cache empty.
  (6beeeaa)
- `BUILD` hashes the precache list and `sw.js`'s own source, not just file bytes.
  Without that, changing how responses are served rekeys nothing and ships
  invisibly. (6beeeaa)
- `data-theme` is stamped by an inline head script before first paint; the
  stylesheet deliberately has NO `prefers-color-scheme` query, so CSS only ever
  sees a settled theme and "System" can follow the OS live. (71fb573)
- Dark tokens flip each ramp end-for-end: step 100 is always the step nearest the
  ground. That is why no component needs a dark-mode rule. (71fb573)
- The beat grid box is ONE height per viewport regardless of beat count; cells
  shrink inside it. Sizing it to its rows moves the tempo and transport under the
  finger. The reserve constants are measured from the laid-out screen —
  re-measure them if the layout changes, they were wrong once and pushed the
  chevron off the bottom. (74a95e0, 88fe778)
- The swing name slot always holds a line box, blank or not. The row aligns on
  the baseline, and an absent name lets the heading ride 6px up, shifting the
  whole panel — visible as the volume track appearing to change thickness at 3x.
  (88fe778)
- Changing subdivision converts the anchor tick; take it only when it names a
  whole tick, otherwise wait for the next beat. Rounding to the nearest pair
  moves the beat itself and dragging the slider compounds it. (2dd3490, 9c73733)
- In the worklet, a pattern change of the same length applies on the next tick;
  only a length change waits for the downbeat, because it re-indexes the bar
  under a listener already inside it. (74a95e0)
- The visual tick reads the schedule ~50ms ahead, capped at a quarter tick, to
  cover the frame's trip to the screen. (74a95e0)
- Audio session is `playback` deliberately: it survives the ring/silent switch at
  the cost of taking the media channel. The web cannot have both — see the table
  in README "Sound and the screen". Do not "fix" this to ambient. (8d7db2e)
- `input[type=range] { margin: 0 }` — the UA sheet's 2px margin offsets the
  thumb's travel from the swing guide dots drawn behind it. (d5774a9)
- Bound SVG path data uses `sc-camel-d`; a literal `d` makes the browser's SVG
  parser reject the placeholder before the runtime substitutes it. (This one
  disappears with the canvas runtime.)
- Always run `node tools/build.mjs` after changing any shipped file.
  `--check` runs in the deploy build and fails it if stale.

## Testing

There is no test infrastructure. Build it. What proved valuable in the session
that produced this brief, as a starting point (those harnesses were throwaway —
rebuild them properly):

- **Worklet unit tests.** Import the worklet source, stub `AudioWorkletProcessor`,
  `sampleRate` and `currentTime`, drive `process()` and assert on the exact click
  sequence. This caught the subdivision drift and proved the accent fix. Assert:
  N clicks per beat for every subdivision 1–8; accents exactly one bar apart;
  accents stay on the beat through an aggressive slider drag.
- **Service worker scenarios**, driven with Puppeteer against a local server that
  mimics Cloudflare (307 on `/index.html`): normal load, a hostile origin where
  even `./` redirects, a missing precache asset, offline, and the
  update-detection flow with a simulated deploy.
- **Layout invariants**: assert the transport and tempo do not move across beat
  counts 1–24, that nothing clips, and that everything fits at viewport heights
  629/667/745/812 — 629 is a mini with Safari toolbars showing and is the case
  that breaks.
- **Panel stability**: assert every row measures identically across clicks per
  beat 1–8.
- Prefer measuring geometry over screenshot diffing; it localises failures.

Notes: chrome-headless-shell needs an explicit `executablePath`, and synthetic
`blur`/`visibilitychange` events need `bubbles: true` to reach window handlers.

## Deliverables

Working tree clean, `node tools/build.mjs --check` passing, deploy green, and the
app verified in a browser — not just in tests. Commit in reviewable steps with
messages explaining _why_, matching the existing history's style.

## Decide and state explicitly

- Bundler or no bundler, and what the no-build path costs.
- Whether the offline guarantee stays absolute or first-paint-only.
- Whether the Organic design system stays vendored or becomes a dependency.

See `docs/refactor-plan.md` for how those were decided and the order of work.
