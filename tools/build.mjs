/* Regenerates the precache list and version hash in sw.js by walking what is
   actually on disk, so the list cannot drift from the shipped files. Drift only
   breaks a cold or slow launch, which is exactly the launch nobody tests by hand.

   node tools/build.mjs          rewrite sw.js
   node tools/build.mjs --check  exit 1 if sw.js is stale */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['.git', 'tools', 'node_modules']);
const SKIP_FILES = new Set(['sw.js', '_headers', '.gitignore', 'README.md', 'LICENSE']);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      if (!SKIP_DIRS.has(name)) out.push(...walk(abs));
    } else if (!name.startsWith('.')) {
      out.push(abs);
    }
  }
  return out;
}

const files = walk(ROOT)
  .map((f) => relative(ROOT, f).split('\\').join('/'))
  /* the .svg icons are build sources for the .png the app actually references */
  .filter((f) => !SKIP_FILES.has(f) && !f.startsWith('ds/README') && !f.endsWith('.svg'));

/* Hash the file *contents*, not just the names: an HTML- or CSS-only edit has
   to bump the version too, or a copy change ships to nobody. */
const h = createHash('sha256');
for (const f of files) {
  h.update(f);
  h.update(readFileSync(join(ROOT, f)));
}
const version = h.digest('hex').slice(0, 16);

const list = files.map((f) => `  '${f}',`).join('\n');
const block = `/* @generated-begin */
const VERSION = '${version}';
const PRECACHE = [
  './',
${list}
];
/* @generated-end */`;

const swPath = join(ROOT, 'sw.js');
const sw = readFileSync(swPath, 'utf8');
const next = sw.replace(/\/\* @generated-begin \*\/[\s\S]*?\/\* @generated-end \*\//, block);

if (process.argv.includes('--check')) {
  if (next !== sw) {
    console.error('sw.js is stale — run `node tools/build.mjs`');
    process.exit(1);
  }
  console.log(`sw.js up to date (${files.length} precached, version ${version})`);
} else {
  writeFileSync(swPath, next);
  console.log(`sw.js updated: ${files.length} files precached, version ${version}`);
  for (const f of files) console.log('  ' + f);
}
