/* Regenerates the precache list and version hash in sw.js by walking what is
   actually on disk, so the list cannot drift from the shipped files. Drift only
   breaks a cold or slow launch, which is exactly the launch nobody tests by hand.
   Runs after tools/inline.mjs, so BUILD hashes the shell with the theme boot
   already inlined rather than the placeholder. */

import { createHash } from "node:crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = join(HERE, "dist");
const STAMP = join(HERE, "sw-version.json");
const SKIP_DIRS = new Set(["tests", "tools"]);
const SKIP_FILES = new Set([
  "sw.js",
  "_headers",
  ".gitignore",
  "LICENSE",
  "wrangler.jsonc",
  "package.json",
  "package-lock.json",
]);

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      if (!SKIP_DIRS.has(name)) out.push(...walk(abs));
    } else if (!name.startsWith(".")) {
      out.push(abs);
    }
  }
  return out;
}

/* Not shipped: prose, wherever it sits in the tree; the .svg icons the .png the
   app references were drawn from; and pwa/theme-boot.js, which tools/inline.mjs
   generates the inline copy in index.html from rather than shipping as a file. */
/** @param {string} f */
const SOURCES = (f) =>
  f.endsWith(".svg") ||
  f.endsWith(".md") ||
  f.endsWith(".map") ||
  f === "pwa/theme-boot.js" ||
  f === "metronome/worklet-processor.js";

/* The processor runs in the audio thread, compiled from a Blob rather than fetched,
   so the click never waits on a request. It is authored as a real module and
   type-checked; this inlines the compiled output as the string addModule() needs.
   Guarded so a second run over the same dist/ is a no-op rather than a crash on
   its own already-consumed input. */
const processorPath = join(ROOT, "metronome/worklet-processor.js");
if (existsSync(processorPath)) {
  const processor = readFileSync(processorPath, "utf8")
    .replace(/^export\s*\{\s*\};?$/m, "")
    .replace(/^\/\/# sourceMappingURL=.*$/m, "");
  writeFileSync(
    join(ROOT, "metronome/worklet.js"),
    `export const WORKLET_SRC = ${JSON.stringify(processor)};\n`,
  );
  rmSync(processorPath);
  rmSync(`${processorPath}.map`, { force: true });
  rmSync(join(ROOT, "metronome/worklet.js.map"), { force: true });
}

const files = walk(ROOT)
  .map((f) => relative(ROOT, f).split("\\").join("/"))
  .filter((f) => !SKIP_FILES.has(f) && !SOURCES(f));

/* index.html is precached as './' and only as './' — see the SHELL note in
   sw.js. It stays in `files`, so an HTML-only edit still bumps BUILD. */
const precache = ["./", ...files.filter((f) => f !== "index.html")];

/* sw.js is not precached — the browser fetches it through its own update check
   — but its logic is shipped code, so editing it has to rekey the cache as
   well. Its generated block is stripped first, or the hash would feed itself. */
const swSource = readFileSync(join(ROOT, "sw.js"), "utf8").replace(
  /\/\* @generated-begin \*\/[\s\S]*?\/\* @generated-end \*\//,
  "",
);

/* Hash the file *contents*, not just the names: an HTML- or CSS-only edit has
   to bump the version too, or a copy change ships to nobody. The precache list
   and the worker's own source go in as well, so changing what gets cached — or
   how it is served — rekeys the cache instead of leaving a stale one in place. */
const h = createHash("sha256");
h.update(precache.join("\n"));
h.update(swSource);
for (const f of files) {
  h.update(f);
  h.update(readFileSync(join(ROOT, f)));
}
const build = h.digest("hex").slice(0, 12);

const swPath = join(ROOT, "sw.js");
const sw = readFileSync(swPath, "utf8");

/* The timestamp is what a human reads; BUILD is what actually keys the cache,
   and it moves only when a shipped byte does. The pair is committed rather than
   read back out of dist/sw.js, which the build wipes and tsc re-emits with the
   placeholder: with nothing to compare against, every rebuild of unchanged
   source would stamp a fresh VERSION, and the byte difference would offer every
   user an update for nothing. Local time, because the person reading it is the
   person who ran the build. */
const stamp = existsSync(STAMP)
  ? JSON.parse(readFileSync(STAMP, "utf8"))
  : null;
let version;
if (stamp && stamp.build === build) {
  version = stamp.version;
} else {
  const d = new Date();
  /** @param {number} n */
  const p2 = (n) => String(n).padStart(2, "0");
  version =
    `${p2(d.getFullYear() % 100)}${p2(d.getMonth() + 1)}${p2(d.getDate())}` +
    `.${p2(d.getHours())}${p2(d.getMinutes())}`;
  writeFileSync(STAMP, JSON.stringify({ build, version }, null, 2) + "\n");
}

/* Written the way Prettier would write it, so formatting the tree and
   regenerating this block do not fight over the same lines. */
const list = precache.map((f) => `  "${f}",`).join("\n");
const block = `/* @generated-begin */
const VERSION = "${version}";
const BUILD = "${build}";
const PRECACHE = [
${list}
];
/* @generated-end */`;
const next = sw.replace(
  /\/\* @generated-begin \*\/[\s\S]*?\/\* @generated-end \*\//,
  block,
);

writeFileSync(swPath, next);
console.log(
  `sw.js updated — version ${version}, build ${build}, ${precache.length} precached`,
);
for (const f of precache) console.log("  " + f);
