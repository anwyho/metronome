/* Injects the compiled theme boot into the shell and writes the policy that
   allows it. Both inline scripts are hashed here, so a change to either cannot
   ship a CSP that blocks it. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");
/** @param {string} s */
const sha = (s) =>
  "'sha256-" + createHash("sha256").update(s, "utf8").digest("base64") + "'";

const boot = readFileSync(join(DIST, "pwa/theme-boot.js"), "utf8").trim();
let html = readFileSync(join(DIST, "index.html"), "utf8");

html = html.replace(/<script data-theme-boot><\/script>/, `<script>${boot}</script>`);
if (!html.includes(boot)) {
  console.error("the theme-boot placeholder was not found in index.html");
  process.exit(1);
}
writeFileSync(join(DIST, "index.html"), html);

/* Every inline <script> in the shell, hashed. An inline script the policy does
   not name is silently blocked, and the app fails to theme or fails to boot.
   Comments are stripped first: index.html's own head comment talks about
   `<script src>` in prose, and a plain tag-scan would mistake that text for an
   opening tag. */
const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
const inlines = [
  ...withoutComments.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g),
].map((m) => m[1] ?? "");
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
writeFileSync(join(DIST, "_headers"), headers.replace("@CSP@", policy));
console.log(`inlined the theme boot and hashed ${inlines.length} inline scripts`);
