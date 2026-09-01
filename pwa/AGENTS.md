# Reusing this shell

`pwa/` is meant to be lifted into another project. That means lifting a
TypeScript toolchain along with it — the guarantees below come from how the
build shapes the output, not just from what the source files say.

## What to copy

`pwa/`, `sw.ts`, `tools/build.mjs`, `tools/inline.mjs`, `tools/copy-static.mjs`,
`tools/check-scripts.mjs`, `tsconfig.base.json`, `tsconfig.json`,
`tsconfig.worker.json`, `tsconfig.classic.json`, and the head of `index.html`
(the `<script data-theme-boot>` placeholder and the two `<script>` tags below
the stylesheets). `pwa/README.md` explains what each file does; this file is
the rules an agent gets wrong.

## Rules that look like details and are not

- **Never add `import` or `export` to `register.ts`, `theme-boot.ts` or
  `sw-runtime.ts`.** They emit as classic scripts only because they contain no
  top-level module syntax. TypeScript 7 removed `"module": "none"`, so a stray
  import is a **silent** shape change now, not a compile error —
  `tools/check-scripts.mjs` is what catches it, by reading the emitted bytes,
  not the source. A `<script src>` module does not run during parse: the
  worker check would move to after load, and the theme boot to after first
  paint, which flashes.
- **`sw-runtime.ts` declares no top-level bindings.** It runs through
  `importScripts`, which evaluates into the same global lexical environment as
  the host `sw.js` — a top-level `const` here collides with the consuming
  project's own, and the worker never installs.
- **No import map, and no bare specifiers.** `tools/vendor.mjs` rewrites bare
  `preact` specifiers to relative paths because import maps need iOS 16.4. The
  UI uses the classic JSX runtime (`jsxFactory: "h"`) with a per-file relative
  import for the same reason. This is an iOS home-screen PWA; do not raise
  that floor.
- **The shell is precached as `'./'`, never `'index.html'`.** An origin that
  redirects `/index.html` to the directory form resolves a fetch with the
  redirect flag set, and a flagged response answering a navigation is rejected
  outright. iOS reports "Response served by service worker has redirections"
  and the app will not launch.
- **`build.mjs` writes into `dist/sw.js`, not the source.** `sw.ts`'s generated
  block holds permanent placeholders; editing them does nothing.
- **The precache is filled by hand, not `addAll`.** `addAll` stores whatever a
  redirect resolved to. The install is all-or-nothing on purpose: a cache that
  claims to be complete and is not strands the next cold launch with no way to
  notice from inside the worker.
- **Navigations are cache-first, never network-first.** A slow network hangs
  rather than rejecting, so network-first-with-fallback stalls for exactly as
  long as the network is bad.
- **`tools/inline.mjs` runs before `tools/build.mjs`.** Injection changes
  `index.html`'s bytes, and `BUILD` hashes them. Reversed, the worker caches a
  shell whose hash it does not have.
- **Every inline `<script>` needs a CSP hash.** `inline.mjs` hashes what it
  finds in the compiled `dist/index.html`. Add an inline script and rebuild —
  never hand-write a hash.

**Known property, not a bug:** TypeScript 7 removed `alwaysStrict: false`, so
`register.ts` and `theme-boot.ts` carry a `"use strict"` prologue the
original hand-written files did not. Both are IIFEs with every binding
declared, so it changes nothing at runtime — but a reader diffing shipped
bytes against source should know why they differ.

## Changing the shell

Run `npm test` after any change — it builds first. `tests/browser/service-worker.test.ts`
is the spec that proves the offline guarantee; a change that passes everything
else and fails that one has broken the thing the shell exists for.
