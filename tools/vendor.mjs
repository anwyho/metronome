/* Copies the ES-module builds of the runtime dependencies into vendor/.

   node tools/vendor.mjs          rewrite vendor/
   node tools/vendor.mjs --check  exit 1 if vendor/ does not match node_modules

   The app is served as plain files with no bundler, so a bare specifier —
   `import { h } from "preact"` — would need an import map, and import maps
   need iOS 16.4. Rewriting the specifier to a relative path here instead makes
   the vendored files self-resolving and costs nothing at runtime.

   `node_modules` is a development concern only. Nothing in package.json is
   fetched by the browser; these copies are what ship. */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const from = (p) => join(ROOT, "node_modules", p);
const version = (pkg) =>
  JSON.parse(readFileSync(from(pkg + "/package.json"), "utf8")).version;

const MODULES = [
  {
    out: "preact.module.js",
    src: "preact/dist/preact.module.js",
    pkg: "preact",
  },
  {
    out: "hooks.module.js",
    src: "preact/hooks/dist/hooks.module.js",
    pkg: "preact",
  },
  { out: "htm.module.js", src: "htm/dist/htm.module.js", pkg: "htm" },
];

function build({ src, pkg }) {
  const banner = `/* ${pkg}@${version(pkg)} — vendored by tools/vendor.mjs, do not edit */\n`;
  return (
    banner +
    readFileSync(from(src), "utf8")
      /* The one edit: a bare specifier the browser cannot resolve becomes the
         file sitting next to it. */
      .replace(
        /(from|import)(\s*)(["'])preact\3/g,
        "$1$2$3./preact.module.js$3",
      )
      .replace(/\s*\/\/# sourceMappingURL=\S*/, "")
      .trimEnd() +
    "\n"
  );
}

const check = process.argv.includes("--check");
let stale = false;
for (const module of MODULES) {
  const path = join(ROOT, "vendor", module.out);
  const next = build(module);
  let current = null;
  try {
    current = readFileSync(path, "utf8");
  } catch {}
  if (current === next) continue;
  if (check) {
    console.error(
      `vendor/${module.out} is stale — run \`node tools/vendor.mjs\``,
    );
    stale = true;
  } else {
    writeFileSync(path, next);
    console.log(`vendor/${module.out} — ${next.length} bytes`);
  }
}
if (stale) process.exit(1);
if (check) console.log("vendor/ matches node_modules");
