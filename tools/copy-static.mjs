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
for (const d of DIRS) {
  cpSync(join(ROOT, d), join(DIST, d), {
    recursive: true,
    /* Type-only shims for the vendored runtime files — nothing the browser
       ever fetches. */
    filter: (src) => !src.endsWith(".d.ts"),
  });
}
console.log(
  `copied ${FILES.length} files and ${DIRS.length} directories into dist/`,
);
