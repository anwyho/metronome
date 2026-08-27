#!/usr/bin/env bash
# Assembles the deployable tree. The app is nested one level down so it serves
# at /metronome; _headers has to sit at the assets root to be read at all.
set -euo pipefail
cd "$(dirname "$0")/.."

node tools/build.mjs --check

[ -d _site ] && rm -rf _site
mkdir -p _site/metronome
cp -R index.html app.js sw.js metronome-core.js support.js \
      manifest.webmanifest vendor ds fonts icons _site/metronome/
cp _headers _site/_headers

echo "built _site/ ($(find _site -type f | wc -l | tr -d ' ') files)"
