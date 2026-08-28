# An offline-first PWA, with a metronome in it

Two things live here. `pwa/` is a small, documented shell — a service worker
that precaches everything and detects its own deploys, a theme that settles
before the first paint, and the build step that keys the cache to the bytes it
is caching. The metronome is the app that sits inside it, and the reason the
shell is worth anything: it was built by running into every one of these
problems for real.

Deployed at **https://a.aaanth.com/metronome/**.

The metronome has an accent grid, subdivisions, swing, tap tempo, count-in, and
a link that carries the whole setup. Add it to an iOS home screen and it
launches from cache with no network at all. Timing runs in an `AudioWorklet` —
clicks are synthesised in the audio thread from a sample-accurate tick
schedule, so the tempo does not drift when the main thread is busy. There are
no audio files to load.

## Reusing the shell

Copy `pwa/`, `sw.js`, `tools/build.mjs` and the head of `index.html` into
another project. **[`pwa/README.md`](pwa/README.md)** is the guide: what each
file does, how they are wired up, what each guarantee costs, and the handful of
things that look like details and are not — why the shell is precached as `./`
and never as `index.html`, why the precache is filled by hand rather than with
`addAll`, why the worker messages the client a navigation is _creating_ rather
than the one it replaces.

## Run it

There is no bundler, and the whole app is plain files. That is a deliberate
property: any static file server serves it, and there is no build step in front
of a local edit.

```sh
python3 -m http.server 8000
# then open http://127.0.0.1:8000/
```

Service workers need `localhost` or HTTPS — `127.0.0.1` is fine, a `file://`
URL is not. `node tools/serve.mjs` serves the same tree the way the deployed
origin does, including the 307 from `/index.html` to the directory form, which
is worth exercising before a deploy.

What the no-build path costs, stated: a cold first load pays an import
waterfall two levels deep, which every later load skips because the worker
precaches the whole graph; nothing is tree-shaken, so what is vendored is what
ships; and there is no JSX, so the UI is written with
[htm](https://github.com/developit/htm) tagged templates.

```sh
npm install          # Prettier, Puppeteer, and the sources vendor/ is built from
npm test             # unit tests under node:test, browser tests under Puppeteer
npm run format       # Prettier
npm run vendor       # re-copy Preact + htm out of node_modules into vendor/
npm run site         # assemble _site/ the way the deploy does
```

The browser tests need a full Chrome — `chrome-headless-shell` has no service
worker implementation, and half of what they cover is the worker. `npx
puppeteer browsers install chrome` provides one; `CHROME_PATH` points at
another.

## After changing any shipped file

```sh
node tools/build.mjs          # rewrite the generated block in sw.js
node tools/build.mjs --check  # exit 1 if stale; runs in the deploy build
```

`sw.js` carries a generated block — the precache list, a `VERSION` and a
`BUILD` — written by walking what is actually on disk, so the list cannot drift
from the shipped files. Regenerate it or the change ships to nobody. The same
command checks that the inline theme boot in `index.html` still matches
`pwa/theme-boot.js`, and `tools/build-site.sh` checks that every precached path
made it into `_site/`.

## Layout

```
index.html          the shell: PWA head, inline theme boot, the module entry
sw.js               configuration + the generated block; imports the runtime
pwa/                the reusable shell — see pwa/README.md
metronome/          the domain: worklet, timing, pattern, tempo, swing, share,
                    prefs, engine, store. No DOM in any of it.
ui/                 App, components/, hooks/, and layout.js
styles/             tokens.css (Organic) + base.css + app.css
vendor/             Preact 10 + hooks + htm, as ES modules
fonts/ icons/       Caprasimo + Figtree (latin subset); the .svg are the .png sources
tests/              node:test units, Puppeteer for the rest
tools/              build.mjs, vendor.mjs, serve.mjs, build-site.sh
_headers            cache headers; paths carry the /metronome prefix
wrangler.jsonc      Workers Static Assets config + route
docs/               the brief this restructure answered, and the plan
```

`metronome/` holds no DOM and `ui/` holds no audio. The scheduling maths, the
bar model, the tap averaging, the link format and the hold-repeat ramp are pure
functions with direct unit tests; `engine.js` holds the audio context, the
worklet node and the wake lock and no state at all.

## Sound and the screen

The audio session is **playback**, so the click survives a screen lock, a
backgrounded tab, and the ring/silent switch. A metronome that goes quiet
because the phone is on silent is not much of a metronome.

The price is that playback _is_ the media channel: starting the click
interrupts whatever else was playing. That is not something this app can refine
away. The combination you would want exists natively — `AVAudioSessionCategory`
`Playback` with the `mixWithOthers` option mixes _and_ ignores the switch — but
the web cannot ask for it. WebKit never sets that option, and every session type
reachable from the web that mixes maps to the same silence-obeying category:

| `navigator.audioSession.type` | iOS category     | mixes   | ignores silent switch |
| ----------------------------- | ---------------- | ------- | --------------------- |
| `playback`                    | MediaPlayback    | no      | **yes**               |
| `ambient`                     | AmbientSound     | **yes** | no                    |
| `transient`                   | AmbientSound     | **yes** | no                    |
| `transient-solo`              | SoloAmbientSound | no      | no                    |

`transient` reads like the exception — the spec has it mixing with playback
audio — but it maps to the same category as `ambient` and behaves identically on
iOS. There is no third option, so this is a pick-one, and it was picked for the
silent switch.

Starting the transport also takes a screen wake lock, which is what keeps the
beat grid in front of you rather than what keeps the sound alive. The system can
reclaim that lock on its own — a hidden tab, battery saver — so the sentinel is
watched and a new one taken on the next `visibilitychange`. A dead sentinel left
in place reads as held, and the screen would sleep mid-run.

## Timing

Clicks are scheduled against an **anchor**: one (tick, time) pair the whole grid
is measured from. Changing the tempo, the subdivision or the swing re-bases that
anchor rather than restarting the count, which is what keeps the beat where the
listener last heard it.

Three things in `metronome/timing.js` are load-bearing, and each was a bug once:

- The new anchor is taken from the transport's **fractional** position, not the
  tick it last sounded. Rounding down and taking that tick's pair lands on a
  tick already played, and the worklet plays it again — a doubled click under
  every tempo tap made in the first half of a pair.
- A **swinging** transport re-anchors on a pair boundary, because swing splits
  a pair long-short and landing between the two moves the split. A straight one
  takes the very next tick, so the change is heard sooner.
- Changing the **subdivision** converts the anchor tick, and takes the
  conversion only when it names a whole tick in the new grid. Rounding to the
  nearest one moves the beat itself — eight-per-beat tick 50 is beat 6.25, which
  four-per-beat cannot name — and dragging the slider stacks those errors until
  the downbeat leaves the pulse. Otherwise it waits for the next beat, the one
  position both grids agree on.

The visual tick reads the schedule about 50ms ahead, capped at a quarter tick, to
cover the frame's trip to the screen; without it the dot lights behind the click.

## Layout invariants

The beat grid box is **one height per viewport, whatever the beat count** — the
cells shrink inside it. Sizing the box to its rows slides the tempo and the
transport under the finger as beats are added. The reserve constants in
`ui/layout.js` are measured from the laid-out screen; re-measure them if the
layout changes. They were wrong once and pushed the settings chevron off the
bottom of a small phone. `tests/layout.test.js` measures geometry rather than
diffing screenshots, because a measurement says which element moved.

The swing name slot always holds a line box, blank or not. The row aligns on the
baseline, and an absent name lets the heading ride up, shifting everything below
it — which reads as the volume track changing thickness.

## Deploying

Cloudflare Workers (Static Assets), deployed from Git via Workers Builds.

| Setting                      | Value                      |
| ---------------------------- | -------------------------- |
| Build command                | `bash tools/build-site.sh` |
| Deploy command               | `npx wrangler deploy`      |
| Path                         | `/`                        |
| Non-production branch builds | off                        |
| Cloudflare Access            | off — it is a public app   |

`tools/build-site.sh` runs `build.mjs --check` (so a stale precache list fails
the deploy rather than breaking cold launches) and assembles `_site/`:

```
_site/_headers              must sit at the assets root to be read
_site/metronome/…           nested, so the app serves at /metronome
```

`aaanth.com` must be an active zone on the same Cloudflare account for the
route in `wrangler.jsonc` to bind.

## Installing on iOS

Open **https://a.aaanth.com/metronome/** in Safari, tap Share, then
**Add to Home Screen**. The name and icon come from
`apple-mobile-web-app-title` and `apple-touch-icon`, not from the manifest, so
both are set explicitly in `index.html`.

The manifest deliberately has **no `id`** — it then defaults to `start_url`,
which is relative, keeping the app portable across paths. An explicit `"id"`
of `/` would claim the origin root instead.

An installed PWA is welded to the origin _and_ scope it was installed from. If
this ever moves, the old icon keeps opening the old origin's cached copy —
moving it needs a real worker left behind at the old URLs, never a redirect.

## Storage

| Key             | What                                                               |
| --------------- | ------------------------------------------------------------------ |
| `metro.theme`   | the theme choice, absent when it is "system"                       |
| `metro.prefs.a` | volume, count-in, the dismissed install hint, and the last pattern |

They are separate because the theme has to be readable by the inline boot
script, before anything that knows the app's instance id has run.

## Design

The look is Organic: a cream-and-sand ground, a terracotta accent, a sage second
accent, Caprasimo display over Figtree, and radii that grow into pills.
`styles/tokens.css` is its token sheet, vendored — every role carries a 100–900
ramp generated in OKLCH on one shared lightness scale, so the same step of any
ramp has the same visual weight.

The dark ground flips every ramp end-for-end: step 100 is always the step
nearest the ground, in both themes. That is why no component here needs a
dark-mode rule, and why nothing in `styles/app.css` names a colour.

## Provenance

The UI began as a Claude Design canvas export, and for a while it _was_ one: the
canvas runtime shipped with it and compiled the page's template at load. That is
gone — the export is not a source you can re-export from any more, and the
markup, the styles and the state layer are ordinary code now. The export itself
is in history at commit 46a56fa:

```sh
git show 46a56fa:"Metronome PWA prototype.zip" > prototype.zip
```

It held four artboards; only **Metronome B**, the settled direction, is this
app.
