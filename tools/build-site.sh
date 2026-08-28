#!/usr/bin/env bash
# Assembles the deployable tree. The app is nested one level down so it serves
# at /metronome; _headers has to sit at the assets root to be read at all.
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build

node tools/build.mjs   # no longer --check; dist is regenerated, never stale

[ -d _site ] && rm -rf _site
mkdir -p _site/metronome
cp -R dist/. _site/metronome/
rm -rf _site/metronome/tests _site/metronome/tools
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
