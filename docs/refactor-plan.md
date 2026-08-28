# Refactor plan

Execution plan for `docs/refactor-brief.md`. Decisions first, then the target
tree, then the order of commits.

## Decisions

### No bundler. Native ES modules, with the bare specifiers rewritten at vendor time.

The plain-files property is worth keeping — `python3 -m http.server` and open it
is the whole local story, and the README leans on it. Native `<script
type="module">` keeps that intact while giving real modules, real files and real
unit tests.

The one thing a bundler buys here is avoiding an import waterfall on a cold
first load. That is a second-launch-is-free problem: the service worker
precaches every module, so only the very first visit pays, and the graph is two
levels deep, not ten. Not worth a build step in front of every local edit.

Bare specifiers (`import { h } from 'preact'`) would need an import map, which
needs iOS 16.4+. Instead `tools/vendor.mjs` copies the ESM builds out of
`node_modules` and rewrites `'preact'` to `'./preact.module.js'`, so the
vendored files are self-resolving and no import map is needed. `node_modules` is
a dev-only concern; nothing in `package.json` is a runtime dependency.

**Cost of the no-build path, stated:** each module is a separate request on a
cold load; there is no dead-code elimination, so what we vendor is what we ship;
and JSX is unavailable — the UI is written with `htm` tagged templates
(`html\`<div/>\``), which is the standard no-build Preact idiom and reads
close enough to JSX.

### The offline guarantee stays absolute.

Every shipped file stays in the precache. The payload is dropping from ~241KB to
~150KB anyway, most of the remainder is fonts and icons, and "add it to a home
screen and it launches with no network at all" is a stated feature. Splitting
the precache would trade a real guarantee for a saving we no longer need.

### Organic stays vendored, and gets trimmed to what is used.

There is no package to depend on, and vendoring is what keeps the no-build path
honest. But the app references none of `.btn`, `.card`, `.nav`, `.table`,
`.dialog`, `.seg`, `.tag`, `.input` or `.radio` — it is all inline styles today.
Those go. What is left is `styles/tokens.css` (the light and dark token blocks,
verbatim, including the ramp inversion that makes dark mode need no rules of its
own) plus the app's own `styles/base.css` and `styles/app.css`.

## Target tree

```
index.html              shell, PWA head, inline theme boot, module entry
sw.js                   generated block + config; importScripts the runtime
manifest.webmanifest
_headers  wrangler.jsonc  package.json

pwa/                    the reusable skeleton — see pwa/README.md
  sw-runtime.js         classic script: offlineWorker({VERSION,BUILD,PRECACHE})
  register.js           registration, update detection, version readout
  theme.js              ESM facade over the inline boot; themechange events
  theme-boot.js         source of the inline snippet; build.mjs checks it matches
  install.js            standalone / coarse-pointer / dismissed state

metronome/              the domain — no DOM in any of these
  worklet.js            WORKLET_SRC, the audio-thread processor
  timing.js             spt / timeAtTick / tickAtTime / anchor conversion  (pure)
  pattern.js            levels, cycle, resize, grouping, rowsFromBeats      (pure)
  tempo.js              tapTempo, tempoMarking                              (pure)
  swing.js              presets, swingApplies, naming                       (pure)
  share.js              parseHash / serializeHash                           (pure)
  prefs.js              localStorage
  engine.js             AudioContext, worklet node, transport, wake lock
  store.js              state + actions, emits change

ui/
  html.js               htm.bind(h)
  App.js
  layout.js             grid sizing and the measured reserve constants      (pure)
  components/           BeatGrid TempoControl Transport SettingsPanel
                        SwingControl SubdivisionControl VolumeControl
                        CountInButton ThemeToggle ShareButton InstallHint
                        UpdateRow HoldButton
  hooks/                useStore useHoldRepeat useViewport useTheme useServiceWorker

styles/  tokens.css base.css app.css
vendor/  preact.module.js hooks.module.js htm.module.js
fonts/ icons/ tools/ tests/ docs/
```

`sw.js` stays at the root — scope `./` depends on it — and keeps the generated
block where `tools/build.mjs` expects it. It `importScripts('pwa/sw-runtime.js')`
rather than being a module worker, because module service workers are only
Safari 16.4+ and there is nothing to gain from requiring that.

## Order of work

Each step leaves the app running and `node tools/build.mjs --check` passing.

1. **Tooling, and tests against the code as it stands.** `package.json`,
   Prettier, `node:test`, Puppeteer, and the local server that mimics
   Cloudflare's 307 on `/index.html`. Write the worklet and service-worker tests
   _first_, against the current files, so the rewrite has something to be
   measured against rather than something to be trusted about.
2. **Vendor Preact/hooks/htm as ESM** (`tools/vendor.mjs`).
3. **Replace the canvas runtime.** New `index.html`, `ui/`, `metronome/`; styles
   move from inline strings into `styles/app.css`. Delete `support.js`,
   `preact-compat.umd.js`, `metronome-core.js`. This is one commit because the
   app cannot half-run, but it is the commit the tests from step 1 exist for.
4. **Extract `pwa/`** out of `index.html`, `app.js` and `sw.js`, with its own
   README and tests.
5. **Trim `ds/styles.css`** into `styles/tokens.css`.
6. **Press-and-hold BPM.** `useHoldRepeat` driven by rAF: rate ramps smoothly
   from ~4 BPM/s to a ceiling over a few seconds, with the ramp itself a pure
   function of hold duration and unit tested. Tap still moves exactly one.
7. **Swing 5–95.** Slider bounds, hash clamp, guide-dot maths (currently
   normalised over 50–75), preset naming.
8. **README rewrite** — template first, metronome as the reference app, existing
   mechanism docs kept.
9. **Rebuild, run the full suite, verify in a real browser, deploy.**

## Test plan

`node --test` for units, Puppeteer for the rest.

| Suite            | Asserts                                                                                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `worklet`        | N clicks per beat for subdivisions 1–8; accents exactly one bar apart; accents stay on the beat through an aggressive subdivision drag; swing < 50 places the off-tick early     |
| `timing`         | anchor conversion takes the exact tick when there is one and the next beat otherwise                                                                                             |
| `share`          | round-trip; never throws on hostile input; clamps to 5–95 swing                                                                                                                  |
| `pattern`        | grouping parse, row wrapping, cycle order                                                                                                                                        |
| `tempo`          | tap outlier rejection                                                                                                                                                            |
| `hold-repeat`    | ramp is monotonic, starts at one step, reaches the ceiling                                                                                                                       |
| `layout`         | transport and tempo do not move across beat counts 1–24; fits at 629/667/745/812; panel rows identical across clicks-per-beat 1–8                                                |
| `service-worker` | normal load; hostile origin where even `./` redirects; missing precache asset fails install and leaves the cache empty; offline launch; update detection with a simulated deploy |

Geometry is measured, not screenshot-diffed. `chrome-headless-shell` needs an
explicit `executablePath`; synthetic `blur`/`visibilitychange` need
`bubbles: true`.

## Payload projection

|               | now       | after                                                      |
| ------------- | --------- | ---------------------------------------------------------- |
| `support.js`  | 69KB      | —                                                          |
| preact vendor | 27KB      | ~17KB (preact + hooks + htm, ESM)                          |
| `index.html`  | 32KB      | ~5KB                                                       |
| app code      | 32KB      | ~45KB (`metronome/` + `ui/`, was partly inside index.html) |
| CSS           | 16KB      | ~14KB (tokens + base + app)                                |
| fonts + icons | 73KB      | 73KB                                                       |
| **total**     | **241KB** | **~155KB**                                                 |

Caprasimo stays. It is 21KB, precached once, `font-display: swap`, and it is the
app's identity — cutting it is a design change, not an optimisation.
