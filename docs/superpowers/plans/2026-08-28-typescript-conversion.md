# TypeScript Conversion + Toolchain Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the whole app to compiled TypeScript under `strict`, split the test suite into fast/browser lanes, ship a CSP, add CI, and document the shell as a reusable template.

**Architecture:** A `tsc` build emits the shipped tree into a gitignored `dist/`. Everything runs from `dist/` — the dev server, both test lanes, and `_site/`. `build.mjs` moves from walking the source tree to walking `dist/`, which makes precache drift structurally impossible rather than merely checked. The UI moves from `htm` tagged templates to `.tsx`, which is what buys real type checking on markup and props.

**Tech Stack:** TypeScript (native `tsc`, v7), Preact 10 + `preact/jsx-runtime` via an import map, `node:test`, Puppeteer, Cloudflare Workers Static Assets, GitHub Actions.

**Spec:** Embedded below — this plan is its own spec. Origin is the review in the session that produced it.

---

## Spec

The user accepted a build step, explicitly overriding the repo's "no bundler, plain
files, no build step in front of a local edit" property, on the grounds that it was
"an early implicit design choice that got codified by an agent." The governing
requirement in its place is **maximum achievable type safety**, subject to two hard
constraints:

1. **No behavior change.** The app must do exactly what it does today.
2. **Offline guarantees preserved.** Every property documented in `pwa/README.md` —
   all-or-nothing precache, cache-first navigation, shell cached as `./`, dual update
   detection, theme settled before first paint — survives intact.

Scope, in the order the user asked for it: TypeScript conversion; test-suite split;
CSP; `pwa/AGENTS.md`; CI.

## Global Constraints

- **`strict: true`**, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch`. No `any` outside a documented
  cast at a browser-API boundary the lib types get wrong.
- **Target `ES2022`, module `ESNext`, `moduleResolution: "bundler"`.**
- **Import specifiers in source are written `./foo.js`** (not `./foo.ts`). TypeScript
  resolves them to `.ts` and emits `.js` — correct for the browser, and required
  because browsers cannot resolve extensionless or `.ts` specifiers.
- **`dist/` is gitignored.** Nothing generated is committed. This deletes the
  `build.mjs --check` staleness concept: the build regenerates from source every time.
- **These three files must emit as classic scripts** (no module wrapper, no `export`):
  `pwa/register.ts`, `pwa/theme-boot.ts`, `pwa/sw-runtime.ts`. Verified: a `.ts` file
  with no top-level `import`/`export` emits plain JS. Do not add an `export` to any of
  them.
- **`sw-runtime.ts` and `sw.ts` compile under a separate tsconfig** with
  `lib: ["ES2022", "WebWorker"]`. DOM and WebWorker libs cannot coexist in one program
  — they declare `self`, `fetch` and `caches` incompatibly.
- **`tools/build.mjs` and `tools/vendor.mjs` stay `.mjs`.** They orchestrate the build,
  so they cannot require the build to have run. They get type checking via a
  `checkJs` tsconfig instead. `tools/serve.mjs` **does** become `tools/serve.ts` and
  compiles into `dist/tools/serve.js` — see Task 1 for why the compiled tests need it
  there.
- **Node 22.18+** (repo is on v22.22.3). Verified: Node's type-stripping does *not*
  resolve a `./foo.js` specifier to `foo.ts`, so tests cannot run on `.ts` sources
  directly. Tests compile into `dist/tests/` and run from there.
- **Prettier stays the formatter.** Add `.ts`/`.tsx` to its scope; `dist/` to
  `.prettierignore`.

---

## File Structure

### New files

| Path | Responsibility |
| --- | --- |
| `tsconfig.base.json` | Shared compiler options. Extended by all others; compiles nothing itself. |
| `tsconfig.json` | The app program: `metronome/`, `ui/`, `pwa/` module files, `tests/`, `tools/serve.ts`. Emits to `dist/`. |
| `tsconfig.worker.json` | `sw.ts` + `pwa/sw-runtime.ts` under `lib: WebWorker`. Emits to `dist/`. |
| `tsconfig.classic.json` | `pwa/register.ts` + `pwa/theme-boot.ts`, emitted as classic scripts. Emits to `dist/`. |
| `tsconfig.tools.json` | `allowJs`+`checkJs`+`noEmit` over `tools/*.mjs`. Checks only. |
| `types/worker.d.ts` | `declare function offlineWorker(config: OfflineWorkerConfig): void` and the config type, for the worker program. |
| `types/globals.d.ts` | `Window.__theme`, `Window.__swInfo`, `Window.__applyUpdate`, `navigator.audioSession`, `navigator.wakeLock` — the browser APIs the DOM lib lacks or gets wrong. |
| `metronome/worklet-processor.ts` | The audio processor as real, type-checked TypeScript. Was an unchecked template literal. |
| `tools/inline.mjs` | Injects the compiled theme boot into `dist/index.html`, then computes the CSP hashes and writes `dist/_headers`. |
| `pwa/AGENTS.md` | The template guide for agents reusing the shell. |
| `.github/workflows/ci.yml` | typecheck, format, unit, browser, build. |

### Deleted files

| Path | Why |
| --- | --- |
| `ui/html.js` | `htm` binding. Replaced by `.tsx`. |
| `vendor/htm.module.js` | `htm` is dropped; JSX compiles at build time instead. |

### Converted in place (`.js` → `.ts`, or `.js` → `.tsx`)

- `metronome/`: `engine`, `pattern`, `prefs`, `share`, `store`, `swing`, `tempo`,
  `timing`, `worklet` → `.ts`
- `pwa/`: `install`, `theme`, `updates` → `.ts` (modules); `register`, `theme-boot`,
  `sw-runtime` → `.ts` (classic); `sw.js` → `sw.ts` (worker)
- `ui/`: `App`, `main` → `.tsx`; `layout`, `hold-repeat` → `.ts`
- `ui/components/` (13): `BeatGrid`, `CountInButton`, `HoldButton`, `InstallHint`,
  `SettingsPanel`, `ShareButton`, `SubdivisionControl`, `SwingControl`,
  `TempoControl`, `ThemeToggle`, `Transport`, `UpdateRow`, `VolumeControl` → `.tsx`
- `ui/hooks/` (5): `useHoldRepeat`, `useServiceWorker`, `useStore`, `useTheme`,
  `useViewport` → `.ts`
- `tests/` (10 specs + 3 helpers) → `.ts`
- `tools/serve.mjs` → `tools/serve.ts`

### The build pipeline, after this plan

```
1. tsc -p tsconfig.json          metronome/ ui/ pwa/ tests/ tools/serve  -> dist/
2. tsc -p tsconfig.worker.json   sw.ts pwa/sw-runtime.ts                 -> dist/
3. tsc -p tsconfig.classic.json  pwa/register.ts pwa/theme-boot.ts       -> dist/
4. node tools/vendor-copy.mjs    static assets                           -> dist/
     index.html manifest.webmanifest styles/ vendor/ fonts/ icons/
5. node tools/inline.mjs         inject compiled theme boot into dist/index.html,
                                 compute CSP hashes, write dist/_headers
6. node tools/build.mjs          walk dist/, write generated block into dist/sw.js
7. bash tools/build-site.sh      assemble _site/ from dist/
```

Steps 5 and 6 are ordered: the injected boot script changes `index.html`'s bytes, and
`BUILD` hashes those bytes.

---

## Task 1: Build pipeline, with every file still JavaScript

Prove the pipeline before converting anything. At the end of this task the app is
byte-for-byte equivalent, all 69 tests pass, and nothing is TypeScript yet. This is
the de-risking task: if `dist/` breaks the service worker, we find out now, with a
one-line `git checkout` as the escape hatch.

**Files:**
- Create: `tsconfig.base.json`, `tsconfig.json`, `tools/copy-static.mjs`
- Modify: `package.json` (scripts, devDependency), `.gitignore`, `.prettierignore`,
  `tools/build.mjs`, `tools/build-site.sh`, `tools/serve.mjs` → `tools/serve.ts`
- Test: existing `tests/**` must pass unchanged in behavior

**Interfaces:**
- Consumes: nothing.
- Produces: `dist/` as the built app tree; `npm run build` as the command that fills
  it; `dist/tools/serve.js` exporting `startServer(options)` with today's signature.

- [ ] **Step 1: Install TypeScript**

```bash
npm i -D typescript
npx tsc --version   # expect 7.x
```

- [ ] **Step 2: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "sourceMap": true,
    "allowJs": true,
    "checkJs": false
  }
}
```

`allowJs` with `checkJs: false` is what lets this task compile the existing `.js`
tree untouched. Task 3 flips `checkJs` on as files convert.

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": []
  },
  "include": ["metronome/**/*", "ui/**/*", "pwa/**/*", "tests/**/*", "tools/serve.ts", "types/**/*"],
  "exclude": ["pwa/sw-runtime.ts", "pwa/register.ts", "pwa/theme-boot.ts", "sw.ts", "dist"]
}
```

- [ ] **Step 4: Move `serve.mjs` into the compiled tree**

`tests/helpers/app.js` imports `../../tools/serve.mjs`. Once helpers compile to
`dist/tests/helpers/`, that specifier resolves to `dist/tools/serve.js` — so `serve`
must land there. Rename it and fix the one import.

```bash
git mv tools/serve.mjs tools/serve.ts
```

In `tests/helpers/app.js`, change the specifier only:

```js
import { startServer } from "../../tools/serve.js";
```

`tools/serve.ts` needs no other edit in this task — it is valid TS already, and
`checkJs` is off so its untyped parameters are tolerated. Its `ROOT` constant
(`resolve(dirname(fileURLToPath(import.meta.url)), "..")`) now resolves to `dist/`,
which is exactly right: the dev server and the browser tests should serve the built
tree.

Its bottom-of-file direct-run guard must survive the move:

```ts
if (import.meta.url === `file://${process.argv[1]}`) {
```

- [ ] **Step 5: Write `tools/copy-static.mjs`**

`tsc` emits only JS. Everything else has to be copied.

```js
/* The shipped files tsc does not emit. Kept in step with tools/build.mjs's skip
   list: what is precached is what is copied. */
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

const FILES = ["index.html", "manifest.webmanifest"];
const DIRS = ["styles", "vendor", "fonts", "icons"];

mkdirSync(DIST, { recursive: true });
for (const f of FILES) cpSync(join(ROOT, f), join(DIST, f));
for (const d of DIRS) cpSync(join(ROOT, d), join(DIST, d), { recursive: true });
console.log(`copied ${FILES.length} files and ${DIRS.length} directories into dist/`);
```

- [ ] **Step 6: Point `build.mjs` at `dist/`**

Three edits. `ROOT` becomes the dist tree:

```js
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");
```

`SKIP_DIRS` drops the source-only entries and gains the compiled test tree:

```js
const SKIP_DIRS = new Set(["tests", "tools"]);
```

`SOURCES` drops the `theme-boot` exclusion — in `dist/` the boot script is a real
shipped file and Task 7 will inline it, so it is excluded there instead. Keep `.map`
out of the precache; sourcemaps ship but are not worth caching:

```js
const SOURCES = (f) =>
  f.endsWith(".svg") || f.endsWith(".md") || f.endsWith(".map") ||
  f === "pwa/theme-boot.js";
```

Delete the theme-boot drift check entirely (the `bare`/`boot`/`inlined` block, roughly
lines 56–75). Task 7 replaces checking with injecting, which cannot drift.

- [ ] **Step 7: Add the scripts to `package.json`**

```json
{
  "scripts": {
    "clean": "node -e \"require('node:fs').rmSync('dist',{recursive:true,force:true})\"",
    "compile": "tsc -p tsconfig.json",
    "build": "npm run clean && npm run compile && node tools/copy-static.mjs && node tools/build.mjs",
    "check": "tsc -p tsconfig.json --noEmit",
    "vendor": "node tools/vendor.mjs",
    "site": "bash tools/build-site.sh",
    "serve": "npm run build && node dist/tools/serve.js",
    "test": "npm run build && node --test --test-concurrency=1 \"dist/tests/**/*.test.js\"",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

- [ ] **Step 8: Ignore the build output**

Append `dist/` to `.gitignore` and to `.prettierignore`.

- [ ] **Step 9: Point `build-site.sh` at `dist/`**

Replace the copy block. The hand-written copy list disappears — `dist/` *is* the
shipped tree, which removes the class of bug the existing cross-check guards against.
Keep the cross-check anyway; it costs nothing and now verifies the copy, not a list.

```bash
node tools/build.mjs   # no longer --check; dist is regenerated, never stale

[ -d _site ] && rm -rf _site
mkdir -p _site/metronome
cp -R dist/. _site/metronome/
rm -rf _site/metronome/tests _site/metronome/tools
cp _headers _site/_headers
```

Note `build-site.sh` must now run `npm run build` first. Add it at the top, after the
`cd`:

```bash
npm run build
```

- [ ] **Step 10: Build and run the full suite**

```bash
npm run build
npm test
```

Expected: build succeeds, `dist/` contains the app, **69 tests pass**. If the
service-worker suite fails, the precache list or `serve.ts`'s `ROOT` is wrong — fix
before proceeding. Do not continue with a red suite.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "Build the shipped tree into dist/ before anything is TypeScript"
```

---

## Task 2: Split the test suite

Six specs need only Node; four need Chrome. Today one command runs all ten and costs
48 seconds plus a Chrome download.

**Files:**
- Modify: `package.json`
- Test: both new lanes

**Interfaces:**
- Consumes: `dist/tests/**` from Task 1.
- Produces: `npm run test:unit` and `npm run test:browser`.

- [ ] **Step 1: Confirm the split**

Verified in review: `worklet.test.js` drives the processor through `node:vm`, not a
browser. The lanes are:

| Lane | Specs |
| --- | --- |
| unit | `hold-repeat`, `pattern`, `share`, `tempo`, `timing`, `worklet` |
| browser | `app`, `layout`, `service-worker`, `vendor` |

Re-derive rather than trusting this list, since a spec may have moved:

```bash
grep -l "helpers/app" tests/*.ts   # -> the browser lane
```

- [ ] **Step 2: Write the scripts**

Selection is by path, so a new spec joins a lane by where it sits, not by an
edited glob. Move the four browser specs into `tests/browser/`:

```bash
git mv tests/app.test.js tests/layout.test.js tests/service-worker.test.js \
       tests/vendor.test.js tests/browser/
```

Their `./helpers/app.js` imports become `../helpers/app.js`.

```json
{
  "test": "npm run build && npm run test:unit -- --no-build && npm run test:browser -- --no-build",
  "test:unit": "node --test \"dist/tests/*.test.js\"",
  "test:browser": "node --test --test-concurrency=1 \"dist/tests/browser/*.test.js\""
}
```

Simpler and without the flag-passing awkwardness:

```json
{
  "pretest": "npm run build",
  "test": "npm run test:unit && npm run test:browser",
  "test:unit": "node --test \"dist/tests/*.test.js\"",
  "test:browser": "node --test --test-concurrency=1 \"dist/tests/browser/*.test.js\""
}
```

Use the second form. Note `test:unit` drops `--test-concurrency=1`: only the browser
lane shares a single Chrome and needs serialising.

- [ ] **Step 3: Verify both lanes**

```bash
npm run build
npm run test:unit      # expect ~35 tests, well under 5s, no Chrome
npm run test:browser   # expect ~34 tests, Chrome required
```

Expected: the two counts sum to 69.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Split the suite so the pure tests do not wait on a browser"
```

---

## Task 3: Convert `metronome/` to TypeScript

The domain layer: pure functions with real invariants, no DOM, and the densest
correctness requirements in the repo. Convert bottom-up so each file's dependencies
are already typed.

**Files:**
- Create: `types/globals.d.ts`
- Modify → `.ts`: `metronome/{swing,tempo,pattern,share,timing,prefs,engine,store}.ts`
- Modify: `tsconfig.base.json` (`checkJs: true`)
- Test: `dist/tests/{tempo,share,timing,pattern}.test.js`

**Interfaces:**
- Consumes: `dist/` pipeline from Task 1.
- Produces: the domain types every later task imports —

```ts
export type Level = "accent" | "normal" | "minor" | "off";
export type Pattern = Level[];
export type ThemePref = "system" | "light" | "dark";
export type Resolved = "light" | "dark";
export interface Anchor { tick: number; time: number; }
export interface ShareState { bpm: number; beats: Pattern; sub: number; swing: number; }
```

- [ ] **Step 1: Write `types/globals.d.ts`**

The DOM lib is missing `audioSession` and the app's three `window` globals.

```ts
export {};

declare global {
  interface AudioSession { type: "playback" | "ambient" | "transient" | "transient-solo"; }
  interface Navigator { readonly audioSession?: AudioSession; }

  interface ThemeApi {
    pref: import("../metronome/prefs.js").ThemePref;
    resolved: "light" | "dark";
    order: readonly string[];
    set(p: string): void;
    cycle(): void;
  }
  interface SwInfo { version: string | null; build?: string; update: boolean; }

  interface Window {
    __theme: ThemeApi;
    __swInfo: SwInfo;
    __applyUpdate: () => void;
  }
}
```

- [ ] **Step 2: Turn on `checkJs`**

In `tsconfig.base.json`, set `"checkJs": true`. Every remaining `.js` file is now
checked too. Expect a large error count — that is the point, and it shrinks as files
convert. To keep the build runnable meanwhile, `npm run compile` still emits (tsc
emits despite errors unless `noEmitOnError` is set; do not set it).

- [ ] **Step 3: Convert the leaf modules first**

```bash
git mv metronome/swing.js metronome/swing.ts
git mv metronome/tempo.js metronome/tempo.ts
git mv metronome/pattern.js metronome/pattern.ts
```

Annotate exported signatures. `pattern.ts` is the one carrying a real invariant —
`Level` is a closed set, and today nothing stops a typo'd level string:

```ts
export type Level = "accent" | "normal" | "minor" | "off";
export type Pattern = Level[];

export const LEVELS: readonly Level[] = ["accent", "normal", "minor", "off"];

export function cycleBeat(pattern: Pattern, index: number): Pattern { … }
export function resize(pattern: Pattern, count: number): Pattern { … }
```

- [ ] **Step 4: Run the unit lane**

```bash
npm run build && npm run test:unit
```

Expected: PASS, unchanged count. Type errors elsewhere are expected at this stage;
what must not change is behavior.

- [ ] **Step 5: Convert `share`, `timing`, `prefs`**

```bash
git mv metronome/share.js metronome/share.ts
git mv metronome/timing.js metronome/timing.ts
git mv metronome/prefs.js metronome/prefs.ts
```

`timing.ts` holds the three load-bearing behaviors the README documents. Type the
anchor explicitly so a caller cannot pass a bare tick where a pair is required —
that confusion is precisely the doubled-click bug:

```ts
export interface Anchor { tick: number; time: number; }

export function reanchor(state: ReanchorInput): Anchor { … }
export function tickAtTime(anchor: Anchor, time: number, tickDuration: number): number { … }
export function visualLead(tickDuration: number): number { … }
```

- [ ] **Step 6: Run the unit lane**

```bash
npm run build && npm run test:unit
```

Expected: PASS.

- [ ] **Step 7: Convert `engine` and `store`**

```bash
git mv metronome/engine.js metronome/engine.ts
git mv metronome/store.js metronome/store.ts
```

`store.ts` is the largest file (368 lines) and the one place everything meets. Give
its state a named type and export it — `ui/` consumes it in Task 6:

```ts
export interface State {
  bpm: number;
  bpmText: string;
  beats: Pattern;
  sub: number;
  swing: number;
  volume: number;
  countIn: number;
  running: boolean;
  tick: number;
  taps: number[];
  copied: boolean;
  elapsed: string;
  bars: number;
  unsupported: boolean;
  standalone: boolean;
  touch: boolean;
  installDismissed: boolean;
}

export interface Store {
  getState(): State;
  subscribe(fn: (s: State) => void): () => void;
  mount(): void;
  actions: Actions;
}
```

`Actions` must name every action `ui/` calls. Derive the list from the existing
object rather than guessing:

```bash
grep -n "actions\.\w*" ui/**/*.js | sed 's/.*actions\.\([a-zA-Z]*\).*/\1/' | sort -u
```

- [ ] **Step 8: Full suite**

```bash
npm test
```

Expected: 69 pass. `metronome/` reports zero type errors:

```bash
npx tsc -p tsconfig.json --noEmit 2>&1 | grep "^metronome/" | wc -l   # expect 0
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Type the domain layer, and close the level and anchor types"
```

---

## Task 4: Type the audio worklet

`metronome/worklet.js` exports `WORKLET_SRC`, a 168-line template literal. It is the
most timing-critical code in the repo and the only code TypeScript cannot see. This
task makes it a real module, compiled and checked, then inlined as a string at build
time so `addModule()` still gets a Blob and nothing about the audio path changes.

**Files:**
- Create: `metronome/worklet-processor.ts`, `types/worklet.d.ts`
- Modify: `metronome/worklet.ts` (becomes generated), `tools/build.mjs`
- Test: `dist/tests/worklet.test.js`

**Interfaces:**
- Consumes: `Level`, `Pattern` from Task 3.
- Produces: `WORKLET_SRC: string`, unchanged in shape and content.

- [ ] **Step 1: Declare the AudioWorklet globals**

The DOM lib has no `AudioWorkletProcessor`, `registerProcessor`, `currentTime` or
`sampleRate` — those exist only in the audio thread.

```ts
export {};

declare global {
  class AudioWorkletProcessor {
    readonly port: MessagePort;
    constructor();
    process(
      inputs: Float32Array[][],
      outputs: Float32Array[][],
      parameters: Record<string, Float32Array>,
    ): boolean;
  }
  function registerProcessor(name: string, ctor: typeof AudioWorkletProcessor): void;
  const currentTime: number;
  const sampleRate: number;
}
```

- [ ] **Step 2: Move the processor body into a real module**

Copy the contents of the template literal verbatim into
`metronome/worklet-processor.ts` — no rewriting yet. Then add types until it compiles
clean. The fields to type are the ones the constructor sets: `running`, `bpm`, `sub`,
`swing`, `pattern`, `pendingPattern`, `anchor`, `nextTick`, `startTick`, `vol`,
`queue`, `vi`, `voices`, `cfg`.

```ts
interface Voice { a: boolean; f: number; g: number; d: number; t: number; }
interface ClickConfig { f: number; g: number; d: number; }

class ClickProcessor extends AudioWorkletProcessor {
  private running = false;
  private bpm = 100;
  private sub = 1;
  private swing = 0.5;
  private pattern: Level[] = ["accent", "normal", "normal", "normal"];
  private pendingPattern: Level[] | null = null;
  private anchor: Anchor = { tick: 0, time: 0 };
  private voices: Voice[] = [];
  private cfg: Record<Exclude<Level, "off">, ClickConfig> = {
    accent: { f: 1760, g: 1.0, d: 0.04 },
    minor:  { f: 1173, g: 0.82, d: 0.038 },
    normal: { f: 880,  g: 0.7,  d: 0.035 },
  };
  …
}

registerProcessor("click", ClickProcessor);
```

**Critical:** the numeric constants must be transcribed exactly. A changed gain or
frequency is a behavior change, which the spec forbids. Diff them:

```bash
git show HEAD:metronome/worklet.js | grep -o "f: [0-9.]*\|g: [0-9.]*\|d: [0-9.]*" | sort > /tmp/before.txt
grep -o "f: [0-9.]*\|g: [0-9.]*\|d: [0-9.]*" metronome/worklet-processor.ts | sort > /tmp/after.txt
diff /tmp/before.txt /tmp/after.txt   # expect no output
```

- [ ] **Step 3: Generate `worklet.ts` from the compiled processor**

The processor compiles to `dist/metronome/worklet-processor.js`. It must not be
loaded as a module by the page, only read as text. In `tools/build.mjs`, after the
compile, write the string module:

```js
/* The processor runs in the audio thread, compiled from a Blob rather than fetched,
   so the click never waits on a request. It is authored as a real module and
   type-checked; this inlines the compiled output as the string addModule() needs. */
const processor = readFileSync(join(ROOT, "metronome/worklet-processor.js"), "utf8")
  .replace(/^export\s*\{\s*\};?$/m, "");
writeFileSync(
  join(ROOT, "metronome/worklet.js"),
  `export const WORKLET_SRC = ${JSON.stringify(processor)};\n`,
);
```

Then delete `metronome/worklet-processor.js` from `dist/` so it is not precached
twice, and add `metronome/worklet-processor.js` to `build.mjs`'s `SOURCES` filter.

- [ ] **Step 4: Run the worklet spec**

```bash
npm run build && node --test "dist/tests/worklet.test.js"
```

Expected: 6 tests pass. This spec asserts on the exact click sequence, so it is the
real guard on "no behavior change" here.

- [ ] **Step 5: Full suite**

```bash
npm test
```

Expected: 69 pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Author the audio processor as checked source instead of a string"
```

---

## Task 5: Convert the PWA shell

The shell has three emit shapes in one directory: ES modules, classic scripts, and a
worker. Each needs its own compiler configuration, and getting one wrong breaks the
offline guarantee silently.

**Files:**
- Create: `tsconfig.worker.json`, `tsconfig.classic.json`, `types/worker.d.ts`
- Modify → `.ts`: `pwa/{install,theme,updates,register,theme-boot,sw-runtime}.ts`, `sw.ts`
- Modify: `package.json` (build script), `tsconfig.json` (excludes)
- Test: `dist/tests/browser/service-worker.test.js`

**Interfaces:**
- Consumes: `ThemePref`, `Resolved` from Task 3.
- Produces: `offlineWorker(config)` as a typed global; `pwa/updates.ts` exporting
  `swInfo()` and `applyUpdate()`; `pwa/theme.ts` exporting the theme read.

- [ ] **Step 1: Write `types/worker.d.ts`**

```ts
export {};

declare global {
  interface OfflineWorkerConfig {
    version: string;
    build: string;
    precache: readonly string[];
    cachePrefix: string;
    shell?: string;
  }
  function offlineWorker(config: OfflineWorkerConfig): void;
  interface ServiceWorkerGlobalScope { offlineWorker: typeof offlineWorker; }
}
```

- [ ] **Step 2: Write `tsconfig.worker.json`**

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "WebWorker"],
    "module": "None",
    "types": []
  },
  "include": ["sw.ts", "pwa/sw-runtime.ts", "types/worker.d.ts"]
}
```

`"module": "None"` is what keeps `importScripts` valid and prevents a module wrapper.
Neither file may contain a top-level `import` or `export`.

- [ ] **Step 3: Write `tsconfig.classic.json`**

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM"],
    "module": "None",
    "alwaysStrict": false,
    "types": []
  },
  "include": ["pwa/register.ts", "pwa/theme-boot.ts", "types/globals.d.ts"]
}
```

`alwaysStrict: false` matters. tsc otherwise prepends `"use strict"` to a classic
script, which is a real semantic change to a file that runs before anything else on
the page. Both files are IIFEs and would survive it, but the spec says no behavior
change — so do not introduce one.

- [ ] **Step 4: Convert the three module files**

```bash
git mv pwa/install.js pwa/install.ts
git mv pwa/theme.js pwa/theme.ts
git mv pwa/updates.js pwa/updates.ts
```

These read the globals declared in `types/globals.d.ts`, so they should need
annotations only on their exported signatures.

- [ ] **Step 5: Convert the two classic scripts**

```bash
git mv pwa/register.js pwa/register.ts
git mv pwa/theme-boot.js pwa/theme-boot.ts
```

Do not add `export {}` to either — it would turn them into modules and the
`<script src>` would stop running during parse, which is the whole reason
`register.js` is a classic script.

- [ ] **Step 6: Convert the worker**

```bash
git mv pwa/sw-runtime.js pwa/sw-runtime.ts
git mv sw.js sw.ts
```

In `sw-runtime.ts`, the assignment stays a global assignment:

```ts
self.offlineWorker = function offlineWorker(config: OfflineWorkerConfig): void { … };
```

`sw.ts` keeps its generated block exactly as it is — `build.mjs` writes that block
into `dist/sw.js`, the compiled output, not into the source. So the source's block
holds placeholder values and is never read at runtime:

```ts
/* @generated-begin */
const VERSION = "0";
const BUILD = "0";
const PRECACHE: string[] = [];
/* @generated-end */

importScripts("pwa/sw-runtime.js");

offlineWorker({ version: VERSION, build: BUILD, precache: PRECACHE, cachePrefix: "metronome-" });
```

`build.mjs`'s regex must still match the emitted JS. tsc strips the `: string[]`
annotation, so the emitted block is `const PRECACHE = [];` — confirm the existing
regex matches, and widen it if not.

- [ ] **Step 7: Wire the three compiles into the build**

```json
{
  "compile": "tsc -p tsconfig.json && tsc -p tsconfig.worker.json && tsc -p tsconfig.classic.json",
  "check": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.worker.json --noEmit && tsc -p tsconfig.classic.json --noEmit && tsc -p tsconfig.tools.json"
}
```

- [ ] **Step 8: Verify the emit shapes before trusting the tests**

```bash
npm run build
head -3 dist/pwa/register.js       # expect the IIFE, no "use strict", no import/export
head -3 dist/pwa/theme-boot.js     # same
grep -c "^export\|^import" dist/pwa/sw-runtime.js dist/sw.js   # expect 0 for both
grep "importScripts" dist/sw.js    # expect the call, intact
```

- [ ] **Step 9: Run the service-worker spec**

```bash
node --test "dist/tests/browser/service-worker.test.js"
```

Expected: PASS. This is the spec that proves offline install, update detection and
the redirect handling still work — the whole offline guarantee rides on it.

- [ ] **Step 10: Full suite, then commit**

```bash
npm test
git add -A
git commit -m "Type the shell across its three emit shapes"
```

---

## Task 6: Convert the UI to TSX

The largest type-safety win. `htm` templates are opaque strings to the checker;
`.tsx` gives typed props, typed children and typed element names. Verified in
review: a wrong prop type errors with `TS2322`.

**Files:**
- Create: `vendor/jsx-runtime.module.js` (vendored), import map in `index.html`
- Delete: `ui/html.js`, `vendor/htm.module.js`
- Modify → `.tsx`: `ui/App.tsx`, `ui/main.tsx`, all 13 of `ui/components/*.tsx`
- Modify → `.ts`: `ui/layout.ts`, `ui/hold-repeat.ts`, all 5 of `ui/hooks/*.ts`
- Modify: `tools/vendor.mjs`, `tsconfig.json`, `tests/browser/vendor.test.ts`

**Interfaces:**
- Consumes: `State`, `Store`, `Actions`, `Level`, `Pattern` from Task 3.
- Produces: typed components; `ui/main.tsx` as the entry `index.html` loads.

- [ ] **Step 1: Add JSX options to `tsconfig.json`**

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "preact"
  }
}
```

- [ ] **Step 2: Vendor the JSX runtime**

The emit imports `"preact/jsx-runtime"`. Extend `tools/vendor.mjs` to copy it
alongside the existing three, and drop `htm`:

```js
const MODULES = [
  ["preact/dist/preact.module.js", "vendor/preact.module.js"],
  ["preact/hooks/dist/hooks.module.js", "vendor/hooks.module.js"],
  ["preact/jsx-runtime/dist/jsxRuntime.module.js", "vendor/jsx-runtime.module.js"],
];
```

Confirm the source path before writing it:

```bash
ls node_modules/preact/jsx-runtime/dist/
```

- [ ] **Step 3: Add an import map to `index.html`**

Browsers cannot resolve the bare `"preact/jsx-runtime"` specifier the emit produces.
The map goes **before** the module script, and is what lets every source file import
`"preact"` instead of a relative vendor path.

```html
<script type="importmap">
  {
    "imports": {
      "preact": "./vendor/preact.module.js",
      "preact/hooks": "./vendor/hooks.module.js",
      "preact/jsx-runtime": "./vendor/jsx-runtime.module.js"
    }
  }
</script>
```

This inline script needs a CSP hash — Task 7 computes it.

- [ ] **Step 4: Convert the hooks and the two plain modules first**

```bash
git mv ui/layout.js ui/layout.ts
git mv ui/hold-repeat.js ui/hold-repeat.ts
for f in useHoldRepeat useServiceWorker useStore useTheme useViewport; do
  git mv "ui/hooks/$f.js" "ui/hooks/$f.ts"
done
```

`useStore.ts` is the one that matters — it is where `State` reaches the components:

```ts
import { useSyncExternalStore } from "preact/compat";
import type { Store, State } from "../../metronome/store.js";

export function useStore(store: Store): State { … }
```

Match the existing implementation rather than introducing `useSyncExternalStore` if
it does not already use it — no behavior change.

- [ ] **Step 5: Convert one component and prove the checking works**

Start with `CountInButton` (20 lines, one prop, one action):

```bash
git mv ui/components/CountInButton.js ui/components/CountInButton.tsx
```

```tsx
export function CountInButton({ count, onCycle }: { count: number; onCycle: () => void }) {
  return (
    <button class="count-in" aria-pressed={count ? "true" : "false"} onClick={onCycle}>
      {count ? `${count}` : "Count-in"}
    </button>
  );
}
```

Prove the checker sees prop errors — temporarily pass a wrong type at the call site
and confirm `tsc` fails, then revert:

```bash
npx tsc -p tsconfig.json --noEmit    # expect TS2322 on the deliberate error
```

- [ ] **Step 6: Convert the remaining 12 components and `App`/`main`**

```bash
for f in BeatGrid HoldButton InstallHint SettingsPanel ShareButton \
         SubdivisionControl SwingControl TempoControl ThemeToggle \
         Transport UpdateRow VolumeControl; do
  git mv "ui/components/$f.js" "ui/components/$f.tsx"
done
git mv ui/App.js ui/App.tsx
git mv ui/main.js ui/main.tsx
```

The mechanical translation from htm to JSX:

| htm | JSX |
| --- | --- |
| `` html`<div class="x">` `` | `<div class="x">` |
| `${value}` | `{value}` |
| `<${Component} />` | `<Component />` |
| `<//>` | `</Component>` |
| `...${props}` | `{...props}` |
| `style=${{ "--at": v }}` | `style={{ "--at": v }}` |

Keep `class`, not `className` — Preact accepts `class`, and changing it would churn
every file for nothing.

Four components use object `style` props (`SwingControl` ×2, `BeatGrid` ×2). Preact
applies those through CSSOM, not a `style` attribute, so they are unaffected by
Task 7's CSP. Do not convert them to attribute strings.

- [ ] **Step 7: Delete `htm`**

```bash
git rm ui/html.js vendor/htm.module.js
npm uninstall htm
```

Update `tests/browser/vendor.test.ts`, which asserts on the vendored files — it must
now expect `jsx-runtime.module.js` and not `htm.module.js`.

- [ ] **Step 8: Verify the app renders and the suite passes**

```bash
npm test
```

Expected: 69 pass. The `app` and `layout` specs drive the real UI in Chrome, so they
are the guard that the JSX translation changed no markup.

- [ ] **Step 9: Zero type errors across all four programs**

```bash
npm run check   # expect clean
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Move the UI to TSX, so props and markup are checked"
```

---

## Task 7: Inline the theme boot, and ship a CSP

Injection replaces the drift check: the inline snippet is *generated* from the
compiled boot script, so the two cannot disagree. The same pass hashes the two inline
scripts and writes the policy that allows exactly them.

**Files:**
- Create: `tools/inline.mjs`
- Modify: `index.html`, `_headers`, `tools/serve.ts`, `package.json`
- Test: `dist/tests/browser/app.test.js`, a new CSP assertion

**Interfaces:**
- Consumes: `dist/pwa/theme-boot.js` from Task 5, the import map from Task 6.
- Produces: `dist/index.html` with the boot inlined; `dist/_headers` with the policy.

- [ ] **Step 1: Put a placeholder in `index.html`**

Replace the whole inline `<script>…</script>` block with a marker. The source no
longer carries a copy to drift.

```html
<!-- The theme has to be stamped on <html> before first paint, which rules out a
     <script src>. tools/inline.mjs injects the compiled pwa/theme-boot.js here. -->
<script data-theme-boot></script>
```

- [ ] **Step 2: Write `tools/inline.mjs`**

```js
/* Injects the compiled theme boot into the shell and writes the policy that
   allows it. Both inline scripts are hashed here, so a change to either cannot
   ship a CSP that blocks it. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const sha = (s) => "'sha256-" + createHash("sha256").update(s, "utf8").digest("base64") + "'";

const boot = readFileSync(join(DIST, "pwa/theme-boot.js"), "utf8").trim();
let html = readFileSync(join(DIST, "index.html"), "utf8");

html = html.replace(/<script data-theme-boot><\/script>/, `<script>${boot}</script>`);
if (!html.includes(boot)) {
  console.error("the theme-boot placeholder was not found in index.html");
  process.exit(1);
}
writeFileSync(join(DIST, "index.html"), html);

/* Every inline <script> in the shell, hashed. An inline script the policy does
   not name is silently blocked, and the app fails to theme or fails to boot. */
const inlines = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1]);
const hashes = inlines.map(sha).join(" ");

const policy = [
  "default-src 'self'",
  `script-src 'self' ${hashes}`,
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join("; ");

const headers = readFileSync(resolve(DIST, "..", "_headers"), "utf8");
writeFileSync(
  join(DIST, "_headers"),
  headers.replace("@CSP@", policy),
);
console.log(`inlined the theme boot and hashed ${inlines.length} inline scripts`);
```

- [ ] **Step 3: Add the policy block to `_headers`**

The `@CSP@` token is substituted by `inline.mjs`. Applies to every path, since a
policy that covers only the document leaves the worker unprotected.

```
/metronome/*
  Content-Security-Policy: @CSP@
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
```

Keep the existing per-path `Cache-Control` rules. Cloudflare applies all matching
rules, most-specific last.

- [ ] **Step 4: Close the `_headers` gap found in review**

The app's own JS and CSS have no stated rule and fall to the platform default. State
it, matching the reasoning already in the file:

```
# The worker's precache is what actually invalidates these, via a content hash
# over every shipped byte, so the filename never needs to carry one. Revalidating
# costs a conditional request and keeps a deploy from being served stale.
/metronome/styles/*
  Cache-Control: no-cache

/metronome/ui/*
  Cache-Control: no-cache

/metronome/metronome/*
  Cache-Control: no-cache

/metronome/pwa/*
  Cache-Control: no-cache

/metronome/vendor/*
  Cache-Control: no-cache
```

- [ ] **Step 5: Mirror the CSP in `tools/serve.ts`**

The browser tests must exercise the real policy, or CI passes on a page the deploy
blocks. Read `dist/_headers` and serve the policy it names, rather than duplicating
the string.

- [ ] **Step 6: Wire `inline.mjs` into the build, before `build.mjs`**

```json
{
  "build": "npm run clean && npm run compile && node tools/copy-static.mjs && node tools/inline.mjs && node tools/build.mjs"
}
```

Order is load-bearing: injection changes `index.html`'s bytes, and `BUILD` hashes
them.

- [ ] **Step 7: Write the failing CSP test**

Add to `tests/browser/app.test.ts`:

```ts
it("boots with the deployed CSP in force, and blocks nothing", async () => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
  });
  await open();
  assert.deepEqual(violations, []);
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  assert.ok(theme === "light" || theme === "dark", "theme boot ran under CSP");
});
```

- [ ] **Step 8: Run it**

```bash
npm run build && node --test "dist/tests/browser/app.test.js"
```

Expected: PASS. A failure here means a hash is missing or the import map is
unhashed — read the console violation, it names the blocked script.

- [ ] **Step 9: Verify the header is actually served**

```bash
npm run build && node dist/tools/serve.js 8000 &
curl -sI http://127.0.0.1:8000/metronome/ | grep -i "content-security-policy\|x-content-type"
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Generate the inline boot and the policy that allows it"
```

---

## Task 8: CI

Nothing currently runs the suite. The deploy runs a build check and would ship a
red suite.

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `tsconfig.tools.json` (create, if Task 5 deferred it)

**Interfaces:**
- Consumes: `npm run check`, `format:check`, `test:unit`, `test:browser`, `build`.
- Produces: a required status on `anwyho/metronome`.

- [ ] **Step 1: Write `tsconfig.tools.json`**

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "checkJs": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["tools/*.mjs"]
}
```

```bash
npm i -D @types/node
```

- [ ] **Step 2: Write the workflow**

Two jobs, because the fast lane should not wait on a Chrome download.

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run format:check
      - run: npm run check
      - run: npm run build
      - run: npm run test:unit

  browser:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      # The suite needs a full Chrome: chrome-headless-shell has no service
      # worker implementation, and the worker is half of what these cover.
      - run: npx puppeteer browsers install chrome
      - run: npm run build
      - run: npm run test:browser

  site:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: bash tools/build-site.sh
```

- [ ] **Step 3: Verify each job's commands locally first**

```bash
npm ci && npm run format:check && npm run check && npm run build && npm run test:unit
bash tools/build-site.sh
```

- [ ] **Step 4: Commit and confirm green**

```bash
git add -A
git commit -m "Run the checks that existed but never ran"
git push
gh run watch
```

- [ ] **Step 5: Make it required**

```bash
gh api -X PUT repos/anwyho/metronome/branches/main/protection/required_status_checks \
  -f strict=true -f 'contexts[]=check' -f 'contexts[]=browser'
```

---

## Task 9: Document the shell as a template

`pwa/` is meant to be lifted into other projects, and after this plan that means
lifting a TypeScript toolchain too. An agent given "add offline support using this
shell" needs the constraints that are invisible in the code.

**Files:**
- Create: `pwa/AGENTS.md`
- Modify: `README.md`, `pwa/README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: documentation matching the shipped state.

- [ ] **Step 1: Write `pwa/AGENTS.md`**

It must cover the things an agent gets wrong. Each of these was a real constraint
discovered in this repo, and each has a failure mode that is silent:

```markdown
# Reusing this shell

## What to copy

`pwa/`, `sw.ts`, `tools/build.mjs`, `tools/inline.mjs`, `tools/copy-static.mjs`,
the four tsconfigs, and the head of `index.html`.

## Rules that look like details and are not

- **Never add `import` or `export` to `register.ts`, `theme-boot.ts` or
  `sw-runtime.ts`.** They emit as classic scripts because they have no top-level
  module syntax. Adding either makes tsc emit a module, and a `<script src>`
  module does not run during parse — the worker check moves to after load, and
  the theme boot moves to after first paint, which flashes.
- **Never set `alwaysStrict` for the classic program.** A prepended `"use strict"`
  changes semantics in a file that runs before everything else.
- **The shell is precached as `./`, never `index.html`.** An origin that redirects
  `/index.html` to the directory form resolves a fetch with the redirect flag set,
  and a flagged response answering a navigation is rejected outright. iOS reports
  "Response served by service worker has redirections" and the app will not launch.
- **`build.mjs` writes into `dist/sw.js`, not the source.** The source's generated
  block holds placeholders. Editing them does nothing.
- **The precache is filled by hand, not with `addAll`.** `addAll` stores whatever a
  redirect resolved to, flag and all. The install is all-or-nothing on purpose: a
  cache that claims to be complete and is not strands the next cold launch with no
  way to notice from inside the worker.
- **Navigations are cache-first, never network-first.** A slow network does not
  reject a fetch, it hangs. Network-first with a cache fallback stalls for exactly
  as long as the network is bad.
- **`inline.mjs` runs before `build.mjs`.** Injection changes `index.html`'s bytes
  and `BUILD` hashes them. Reversed, the worker caches a shell whose hash it does
  not have.
- **Every inline `<script>` needs a CSP hash.** `inline.mjs` hashes what it finds.
  Add an inline script and rebuild — never hand-write a hash.

## Changing the shell

Run `npm run build && npm test` after any change. `tests/browser/service-worker.test.ts`
is the spec that proves the offline guarantee; a change that passes everything else
and fails that one has broken the thing the shell exists for.
```

- [ ] **Step 2: Rewrite the README's no-build claims**

`README.md` currently states the no-build property in three places: the "Run it"
section (`python3 -m http.server`), the "what the no-build path costs" paragraph, and
the `ui/` line in Layout. All three are now wrong. Replace with the build pipeline,
and state what the build bought: strict type checking including the audio processor
and the UI markup.

- [ ] **Step 3: Update `pwa/README.md`**

Its "Wiring it up" section shows `.js` filenames and its Versioning section describes
the `--check` staleness concept, which no longer exists. Point it at `AGENTS.md` for
the constraint list rather than duplicating it.

- [ ] **Step 4: Verify the docs match reality**

Every command in both READMEs must run:

```bash
npm ci && npm run build && npm test && npm run site
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Document the shell as a template, and drop the no-build claims"
```

---

## Self-Review

**Spec coverage.** TypeScript conversion — Tasks 3–6 cover `metronome/`, the worklet,
`pwa/`, `ui/`, tests and `serve`; Task 1 and Task 8 cover the two deliberate `.mjs`
exceptions with `checkJs`. Test split — Task 2. CSP — Task 7. `pwa/AGENTS.md` — Task
9. CI — Task 8. No behavior change — guarded by keeping all 69 tests green at every
task boundary, plus the constant-diff in Task 4 Step 2 and the emit-shape check in
Task 5 Step 8. Offline guarantees — Task 5 Step 9 and Task 9 Step 1.

**Known risks, and where they surface.**
1. `checkJs: true` in Task 3 Step 2 turns on checking for files that convert several
   tasks later, so the error count spikes and stays high until Task 6. `noEmitOnError`
   is deliberately not set so the build stays runnable throughout. If this proves
   noisy, an acceptable variant is to leave `checkJs: false` and convert files
   directly — the end state is identical.
2. The import map in Task 6 Step 3 is the one piece with no test until the browser
   lane runs. If `preact/jsx-runtime`'s vendored path is wrong, every component fails
   to render at once — the `app` spec catches it loudly, not subtly.
3. Task 4's transcription of the processor is the highest-risk edit in the plan. The
   worklet spec asserts on the exact click sequence, which is why it is the gate.

**Open decisions carried into execution.**
- TypeScript resolves to v7 (native port) as of writing. If its JSX or `module: None`
  behavior differs from v5, pin `typescript@5` — nothing in this plan depends on a v7
  feature.
- Task 2 Step 2 offers two script shapes; the plan directs the second.
