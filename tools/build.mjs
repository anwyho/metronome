/* Regenerates the precache list and version hash in sw.js by walking what is
   actually on disk, so the list cannot drift from the shipped files. Drift only
   breaks a cold or slow launch, which is exactly the launch nobody tests by hand.

   node tools/build.mjs          rewrite sw.js
   node tools/build.mjs --check  exit 1 if sw.js is stale */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set([
  ".git",
  "tools",
  "tests",
  "docs",
  "node_modules",
  "_site",
]);
const SKIP_FILES = new Set([
  "sw.js",
  "_headers",
  ".gitignore",
  "README.md",
  "LICENSE",
  "wrangler.jsonc",
  "package.json",
  "package-lock.json",
]);

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

/* Build sources, not shipped files: the .svg icons are what the .png the app
   references were drawn from, and pwa/theme-boot.js is the source the inline
   snippet in index.html is checked against. */
const SOURCES = (f) => f.endsWith(".svg") || f === "pwa/theme-boot.js";

const files = walk(ROOT)
  .map((f) => relative(ROOT, f).split("\\").join("/"))
  .filter((f) => !SKIP_FILES.has(f) && !SOURCES(f));

/* The theme has to be resolved and stamped on <html> before first paint, which
   rules out a <script src>, so index.html carries a copy of the boot script.
   Two copies drift; this is what notices. Whitespace is collapsed before
   comparing, because Prettier lays the same code out differently at the two
   indentation depths. */
const bare = (text) => text.replace(/\s+/g, " ").trim();

const boot = readFileSync(join(ROOT, "pwa/theme-boot.js"), "utf8");
const inlined = readFileSync(join(ROOT, "index.html"), "utf8").match(
  /<script>\n([\s\S]*?)\n *<\/script>/,
);
if (
  !inlined ||
  bare(inlined[1]) !== bare(boot.slice(boot.indexOf("(function")))
) {
  console.error(
    "the inline theme boot in index.html no longer matches pwa/theme-boot.js",
  );
  process.exit(1);
}

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
const prevBuild = (sw.match(/const BUILD = "([^"]*)"/) || [])[1];
const prevVersion = (sw.match(/const VERSION = "([^"]*)"/) || [])[1];

/* The timestamp is what a human reads; BUILD is what actually keys the cache.
   Stamped only when the content hash moves, so re-running the build with
   nothing changed neither bumps the version nor trips --check. Local time,
   because the person reading it is the person who ran the build. */
function stampedVersion() {
  if (build === prevBuild) return prevVersion;
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, "0");
  return (
    `${p2(d.getFullYear() % 100)}${p2(d.getMonth() + 1)}${p2(d.getDate())}` +
    `.${p2(d.getHours())}${p2(d.getMinutes())}`
  );
}
const version = stampedVersion();

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

if (process.argv.includes("--check")) {
  if (next !== sw) {
    console.error("sw.js is stale — run `node tools/build.mjs`");
    process.exit(1);
  }
  console.log(
    `sw.js up to date — version ${version}, build ${build}, ${precache.length} precached`,
  );
} else {
  writeFileSync(swPath, next);
  console.log(
    `sw.js updated — version ${version}, build ${build}, ${precache.length} precached`,
  );
  for (const f of precache) console.log("  " + f);
}
