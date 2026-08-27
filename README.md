# Metronome

An offline-first metronome PWA. Accent grid, subdivisions, swing, tap tempo,
count-in, and a shareable link that carries the pattern. Add it to an iOS home
screen and it launches from cache with no network at all.

Timing runs in an `AudioWorklet` — clicks are synthesised in the audio thread
from a sample-accurate tick schedule, so tempo does not drift when the main
thread is busy. There are no audio files to load.

## Run it

Any static file server works; the whole app is plain files.

```sh
python3 -m http.server 8000
# then open http://127.0.0.1:8000/
```

Service workers need `localhost` or HTTPS — `127.0.0.1` is fine, a `file://`
URL is not.

## After changing any shipped file

`sw.js` carries a generated precache list and a version hash over the contents
of every file it precaches. Regenerate it or the change ships to nobody:

```sh
node tools/build.mjs          # rewrite the generated block in sw.js
node tools/build.mjs --check  # exit 1 if stale — worth wiring into CI
```

The hash covers file *contents*, not just names, so an HTML- or CSS-only edit
bumps the version too.

## Layout

```
index.html          the app: shell, PWA head, boot order
metronome-core.js   timing, pattern model, AudioWorklet engine
support.js          Claude Design runtime (renders the template)
app.js              service worker registration + update prompt
sw.js               offline cache — GENERATED precache list, do not hand-edit
vendor/             Preact 10.27.2 (preact + hooks + compat)
ds/styles.css       Organic design-system tokens
fonts/              Caprasimo + Figtree, latin subset
icons/              PNGs the manifest points at; .svg are their sources
tools/build.mjs     regenerates sw.js
_headers            Cloudflare Pages cache headers
```

## Deploying

Static hosting, no build step. On Cloudflare Pages: connect the repo, leave the
build command empty, set the output directory to `/`. `_headers` keeps `sw.js`
uncached — a cached worker script is an app that can never update.

## Installing on iOS

Open the site in Safari, tap Share, then **Add to Home Screen**. The name and
icon come from `apple-mobile-web-app-title` and `apple-touch-icon`, not from the
manifest, so both are set explicitly in `index.html`.

An installed PWA is welded to the origin it was installed from. If this ever
moves to another domain, the old icon keeps opening the old origin's cached
copy — moving it needs a real worker left behind at the old URLs, not a redirect.

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
- **The install hint is gated on `(pointer: coarse)`** in `metronome-core.js` —
  it is Share-sheet instructions, and it was showing on desktop.
- `metronome-core.js` has been reformatted by Prettier; the `AudioWorklet`
  source string inside it is byte-identical to the export.

Re-exporting from the canvas means re-applying that list.
