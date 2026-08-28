/* A static server that behaves like the deployed origin, so the service-worker
   tests exercise the redirect the real one performs rather than a friendlier
   local approximation. Cloudflare's `auto-trailing-slash` 307s /index.html to
   the directory form, and precaching that redirect is what broke iOS launches
   once already.

   node tools/serve.mjs [port]   serve the working tree at /metronome/ */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

/* Mirrors _headers. The worker diffs the shell to detect a deploy, so an
   intermediary holding it stale would hide every content-only change. */
function cacheControl(rel) {
  if (rel === "sw.js" || rel === "index.html" || rel === "manifest.webmanifest")
    return "no-cache";
  if (rel.startsWith("fonts/")) return "public, max-age=31536000, immutable";
  if (rel.startsWith("icons/")) return "public, max-age=604800";
  /* _headers names no rule for the rest, so neither does this. Sending
     `no-store` here instead deadlocked the worker's precache: Chrome stalls a
     handful of the parallel fetches and the install never settles. */
  return null;
}

export function startServer(options = {}) {
  const root = options.root || ROOT;
  const mount = options.mount ?? "/metronome/";

  /* Mutable mid-test: a scenario turns a file off, swaps its bytes to simulate
     a deploy, or makes the directory form redirect too. */
  const state = {
    missing: new Set(options.missing || []),
    files: new Map(Object.entries(options.files || {})),
    redirectShell: !!options.redirectShell,
    offline: false,
    log: [],
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    state.log.push(url.pathname + url.search);

    if (state.offline) {
      req.destroy();
      return;
    }

    if (!url.pathname.startsWith(mount.slice(0, -1))) {
      res.writeHead(404).end("not found");
      return;
    }

    /* The redirect the deployed origin performs, and the reason SHELL is './'. */
    if (
      url.pathname === mount + "index.html" ||
      url.pathname === mount.slice(0, -1)
    ) {
      res.writeHead(307, { Location: mount + url.search }).end();
      return;
    }
    if (
      state.redirectShell &&
      url.pathname === mount &&
      !url.searchParams.has("c")
    ) {
      res.writeHead(307, { Location: mount + "?c=1" }).end();
      return;
    }

    let rel = url.pathname.slice(mount.length);
    if (rel === "") rel = "index.html";
    rel = normalize(rel).replace(/^(\.\.[/\\])+/, "");

    if (state.missing.has(rel)) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
      return;
    }

    let body = state.files.get(rel);
    if (body === undefined) {
      try {
        body = readFileSync(join(root, rel));
      } catch {
        res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
        return;
      }
    }
    if (typeof body === "string") body = Buffer.from(body);

    const cache = cacheControl(rel);
    const ext = rel.slice(rel.lastIndexOf("."));
    res.writeHead(200, {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      "Content-Length": body.length,
      ...(cache ? { "Cache-Control": cache } : {}),
    });
    res.end(req.method === "HEAD" ? undefined : body);
  });

  return new Promise((ok) => {
    server.listen(options.port || 0, "127.0.0.1", () => {
      const { port } = server.address();
      ok({
        port,
        origin: `http://127.0.0.1:${port}`,
        url: `http://127.0.0.1:${port}${mount}`,
        state,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections();
            server.close(done);
          }),
      });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await startServer({ port: Number(process.argv[2]) || 8000 });
  console.log(`serving ${ROOT} at ${s.url}`);
}
