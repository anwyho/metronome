#!/usr/bin/env bash
# Assembles the deployable tree. The app is nested one level down so it serves
# at /metronome; _headers has to sit at the assets root to be read at all.
set -euo pipefail
cd "$(dirname "$0")/.."

node tools/build.mjs --check

[ -d _site ] && rm -rf _site
mkdir -p _site/metronome
# Everything the app is made of. Kept in step with tools/build.mjs's skip list:
# what is precached is what is copied.
cp -R index.html sw.js manifest.webmanifest \
      pwa metronome ui styles vendor fonts icons _site/metronome/
cp _headers _site/_headers

# The copy list above is written by hand; the precache list is generated. A
# path in one and not the other is a cold launch that 404s, so check.
node --input-type=module -e '
import { readFileSync, existsSync } from "node:fs";
const sw = readFileSync("sw.js", "utf8");
const missing = [...sw.matchAll(/^ {2}"([^"]+)",$/gm)]
  .map((m) => (m[1] === "./" ? "index.html" : m[1]))
  .filter((f) => !existsSync("_site/metronome/" + f));
if (missing.length) {
  console.error("_site is missing precached files:\n  " + missing.join("\n  "));
  process.exit(1);
}'

echo "built _site/ ($(find _site -type f | wc -l | tr -d ' ') files)"
