# Metronome

An offline-first metronome PWA. Accent grid, subdivisions, swing, tap tempo,
count-in, and a shareable link that carries the pattern. Add it to an iOS home
screen and it launches from cache with no network at all.

Timing runs in an `AudioWorklet` — clicks are synthesised in the audio thread
from a sample-accurate tick schedule, so tempo does not drift when the main
thread is busy. There are no audio files to load.

Deployed at **https://a.aaanth.com/metronome/**.

## Run it

Any static file server works; the whole app is plain files.

```sh
python3 -m http.server 8000
# then open http://127.0.0.1:8000/
```

Service workers need `localhost` or HTTPS — `127.0.0.1` is fine, a `file://`
URL is not. To exercise the deployed path layout instead, run
`bash tools/build-site.sh` and serve `_site/`, then open `/metronome/`.

## After changing any shipped file

`sw.js` carries a generated block: the precache list, a `VERSION`, and a
`BUILD`. Regenerate it or the change ships to nobody:

```sh
node tools/build.mjs          # rewrite the generated block in sw.js
node tools/build.mjs --check  # exit 1 if stale; runs in the deploy build
```

- **`VERSION`** is `yymmdd.hhmm`, local time, and is what the app shows in its
  settings panel. It is for humans.
- **`BUILD`** is a hash of every precached byte and is what actually keys the
  cache. It exists because a timestamp can repeat — two builds in one minute
  would leave `sw.js` byte-identical and the update would silently not ship.

Both are stamped **only when the content hash moves**, so re-running the build
with nothing changed neither bumps the version nor trips `--check`. Note that
`tools/` is excluded from the hash: editing the build script alone will not
re-stamp anything.

## Checking for updates

Two complementary mechanisms, because either alone has a blind spot:

| Trigger | Catches |
|---|---|
| Worker version changed | any precached file — `BUILD` covers all of them |
| Content diff on the shell | you edited `index.html` and forgot to rebuild |

The worker serves the cached shell, refetches `index.html` behind it, and
messages the page only if the bytes actually differ. The page checks on launch,
on every `visibilitychange`, hourly while open, and on demand from the **Check
for updates** button. The reload is always user-initiated, so a deploy never
interrupts a running metronome.

The first launch after a deploy is still served by the *old* worker, by design.
It updates in the background and launch two is fast. Not a bug.

## Theming

Light and dark, cycling **System → Light → Dark** from the button in the
settings panel. `ds/styles.css` carries both grounds as token blocks and the
markup names no colour directly, so the two themes differ by nothing but the
`data-theme` on `<html>`.

An inline script in the head of `index.html` resolves the choice and stamps that
attribute. It is inline because it has to land ahead of the first paint, and a
`<script src>` would be a network round trip in front of it. It exposes
`window.__theme` — `pref`, `resolved`, `set`, `cycle` — and fires a
`themechange` event the template re-renders on, the same shape as `__swInfo`
and `swinfo`.

The stylesheet deliberately has **no `prefers-color-scheme` query**. The OS is
read from JS instead, so CSS only ever sees a settled theme, and so **System**
can track the OS *live* — a machine flipping to dark at sunset moves the app
with it, no reload. An explicit Light or Dark outranks the OS and persists under
`metro.theme`; cycling back to System clears the key.

That key is separate from `metro.prefs.<id>` because the latter is scoped by an
`instanceId` that is a template prop — the boot script cannot know it before the
template mounts. `metronome-core.js` has no part in any of this.

The in-page `theme-color` meta is rewritten on every change, so the iOS status
bar tracks the theme. The manifest's `theme_color` and `background_color` cannot
— they are read once, at install — so an installed app's launch splash stays
cream whichever theme is active.

## Layout

```
index.html          the app: shell, PWA head, boot order
metronome-core.js   timing, pattern model, AudioWorklet engine
support.js          Claude Design runtime (renders the template)
app.js              worker registration, update prompt, version readout
sw.js               offline cache — GENERATED block, do not hand-edit
vendor/             Preact 10.27.2 (preact + hooks + compat)
ds/styles.css       Organic design-system tokens
fonts/              Caprasimo + Figtree, latin subset
icons/              PNGs the manifest points at; .svg are their sources
_headers            cache headers; paths carry the /metronome prefix
wrangler.jsonc      Workers Static Assets config + route
tools/build.mjs     regenerates the sw.js block
tools/build-site.sh assembles _site/ for deployment
```

## Deploying

Cloudflare Workers (Static Assets), deployed from Git via Workers Builds.

| Setting | Value |
|---|---|
| Build command | `bash tools/build-site.sh` |
| Deploy command | `npx wrangler deploy` |
| Path | `/` |
| Non-production branch builds | off |
| Cloudflare Access | off — it is a public app |

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

An installed PWA is welded to the origin *and* scope it was installed from. If
this ever moves, the old icon keeps opening the old origin's cached copy —
moving it needs a real worker left behind at the old URLs, never a redirect.

## Provenance

Extracted from a Claude Design canvas export (`Metronome PWA prototype.zip`).
The export held four artboards; only **Metronome B** — the settled direction —
is the app. The canvas demo page and the A/C exploration variants are not part
of this repo.

Changes made to turn the artboard into a deployable app:

- **Preact replaces React.** `support.js` fetched React + ReactDOM from unpkg at
  runtime, which no offline app can depend on. It short-circuits that fetch when
  `window.React`/`window.ReactDOM` are already set, so `index.html` sets both to
  `preact/compat` first. The runtime's whole React surface is `createElement`,
  `Fragment`, `isValidElement`, `useState`, `useEffect`, `useMemo`,
  `createContext` and `Component`; compat covers all of it. Compat has no
  `createRoot`, which selects the runtime's own `ReactDOM.render` fallback.
  142KB → 27KB, and `support.js` itself is unmodified.
- **Fonts are self-hosted.** `ds/styles.css` `@import`ed Google Fonts. Now
  `@font-face` against `fonts/`, latin subset, with the system stack as fallback.
- **`$preview` dropped from `data-props`.** It is a canvas-editor size hint, and
  the runtime skips injecting its full-page CSS (`html,body{height:100%}`)
  whenever it is present — leaving the shell's `height:100%` to resolve against
  nothing.
- **`window.__resources = {}`.** Merely being set stops the runtime refetching
  this page on every launch to hot-reload templates.
- **`syncUrl` and `keyboard` default to true**, so the share link round-trips a
  pattern and desktop gets space/arrows/T.
- **The `<helmet>` block is hoisted into a real `<head>`.**
- **A version row was added to the settings panel**, bound to `swVersion` /
  `onCheckUpdates`, which the template re-renders on a `swinfo` event.
- **The install hint is gated on `(pointer: coarse)`** in `metronome-core.js` —
  it is Share-sheet instructions, and it was showing on desktop.
- `metronome-core.js` has been reformatted by Prettier; the `AudioWorklet`
  source string inside it is byte-identical to the export.

Re-exporting from the canvas means re-applying that list.
