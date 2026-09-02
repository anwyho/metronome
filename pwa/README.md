# pwa/

The offline-first shell, with nothing in it that knows what the app is. Copy
this directory, `sw.ts`, the build tools and tsconfigs into another project
and you have the same guarantees: it launches from cache with no network, it
notices its own deploys, and it settles its theme before the first paint. See
the root [README](../README.md#reusing-the-shell) for the full copy list and
[`AGENTS.md`](AGENTS.md) for the constraints that matter when you do —
each one has a failure mode that is silent.

| File            | What it is                                             |
| --------------- | ------------------------------------------------------ |
| `sw-runtime.ts` | the worker: precache, fetch strategy, update detection |
| `register.ts`   | registration and the update surface — a classic script |
| `updates.ts`    | the module-side read of what `register.ts` found       |
| `theme-boot.ts` | the source of the inline snippet in `index.html`       |
| `theme.ts`      | the module-side read of what the boot decided          |
| `install.ts`    | whether an install hint is worth offering              |

`sw-runtime.ts`, `register.ts` and `theme-boot.ts` compile to classic
scripts, not modules — see `AGENTS.md` for why that is load-bearing and how
it is enforced.

## Wiring it up

`index.html`, in this order:

```html
<script data-theme-boot></script>
<script src="pwa/register.js"></script>
<script type="module" src="ui/main.js"></script>
```

`tools/inline.mjs` replaces the `data-theme-boot` placeholder with the
compiled contents of `theme-boot.ts` at build time — inline, because it has to
stamp `<html>` ahead of the first paint, and a `<script src>` would be a
network round trip in front of it. `register.js` runs during parse, before
that `<script type="module">`: the worker is already being checked while the
module graph is still loading.

`sw.js` sits at the root, because the scope it claims is the directory it is
served from:

```js
/* @generated-begin */ /* @generated-end */
importScripts("pwa/sw-runtime.js");
offlineWorker({
  version: VERSION,
  build: BUILD,
  precache: PRECACHE,
  cachePrefix: "yourapp-",
});
```

`tools/build.mjs` writes that generated block into `dist/sw.js` by walking
what actually landed in `dist/`, so the precache list cannot drift from the
shipped files — see the root README for where that fits in the build. It keeps
the `(BUILD, VERSION)` pair it last stamped in a committed `sw-version.json`,
and reuses the VERSION while BUILD is unchanged, so a rebuild of unchanged
source ships the same bytes and prompts nobody.

## What it guarantees, and what it costs

**Every shipped file is precached, and the install is all-or-nothing.** A file
that does not come back `ok` fails the whole install and leaves the cache
empty. A cache that claims to be complete and is not strands the next cold
launch offline, with no way to notice from inside the worker.

**Navigations are cache-first, never network-first.** A network that is up and
crawling does not reject a fetch, it hangs — so a network-first shell with a
cache fallback stalls for exactly as long as the network is slow. The cost is
that the first launch after a deploy is served by the old worker. It updates
behind that launch and the next one is current. That is the trade, not a bug.

**The shell is precached as `'./'`, never as `'index.html'`.** An origin that
redirects `/index.html` to the directory form resolves a fetch of it with the
redirect flag set, and a response carrying that flag is rejected outright when
it answers a navigation — iOS says "Response served by service worker has
redirections" and the app does not launch. The runtime strips the flag from
anything entering the cache and again on the way out, and leaves
`opaqueredirect` alone, whose body cannot be read.

## Update detection

Two mechanisms, because either alone has a blind spot.

| Trigger                         | Catches                                         |
| ------------------------------- | ----------------------------------------------- |
| the worker's script URL changed | any precached file — `BUILD` covers all of them |
| a content diff on the shell     | you edited the HTML and forgot to rebuild       |

The worker serves the cached shell, refetches it behind the response, and
messages the page only if the bytes differ. It messages the client the
navigation is _creating_, found through `clients.get(event.resultingClientId)`:
`clients.matchAll()` answers with the document being replaced, which is torn
down before it can read anything.

`register.js` calls `navigator.serviceWorker.startMessages()`. That queue stays
shut until `onmessage` is assigned or `startMessages()` is called — adding a
listener does not open it, and a message posted while the page was still
parsing would be queued and never delivered.

Finding an update raises a flag the app reads; it presses nothing. The reload
is always the reader's, so a deploy never interrupts whatever is running.

## Versioning

`VERSION` is `yymmdd.hhmm` in local time and is for humans. `BUILD` is a hash
over every precached byte, the precache list itself, and the worker's own
source, and is what actually keys the cache — a timestamp can repeat, and two
builds in one minute would leave `sw.js` byte-identical with the update
silently not shipping. Both are stamped only when the content hash moves.

## Theme

Three states — system, light, dark — cycling in that order. The boot script
resolves the choice and stamps `data-theme` on `<html>`; the stylesheet carries
**no `prefers-color-scheme` query**, so CSS only ever sees a settled theme and
"System" can follow the OS live, with no reload. An explicit light or dark
outranks the OS and persists; cycling back to system clears the key.

The `theme-color` meta is rewritten on every change so the iOS status bar
tracks it. The manifest's `theme_color` and `background_color` cannot — they
are read once, at install — so an installed app's launch splash keeps whatever
the manifest says.
