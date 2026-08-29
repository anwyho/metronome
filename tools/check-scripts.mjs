/* Asserts that the four files that ship as classic scripts still emit as
   classic scripts. A top-level import or export turns any of them into a
   module, and every consequence is silent: `register.js` and `theme-boot.js`
   stop running during parse, so the worker check moves to after load and the
   theme stamp to after first paint; `sw.js` becomes a module worker, which
   Safari before 16.4 refuses outright.

   tsc used to refuse the syntax under `module: "none"`. TypeScript 7 removed
   that option, so the emitted bytes are what gets checked. */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");

const SCRIPTS = [
  "pwa/register.js",
  "pwa/theme-boot.js",
  "pwa/sw-runtime.js",
  "sw.js",
];

/* The word boundary is what keeps `importScripts(` — which sw.js must keep —
   from reading as an import statement. */
const MODULE_SYNTAX = /^(import|export)\b/m;

const modules = SCRIPTS.filter((f) =>
  MODULE_SYNTAX.test(readFileSync(join(DIST, f), "utf8")),
);

if (modules.length) {
  console.error(
    `these ship as classic scripts and must not be modules: ${modules.join(", ")}`,
  );
  process.exit(1);
}
console.log(`${SCRIPTS.length} classic scripts carry no module syntax`);
