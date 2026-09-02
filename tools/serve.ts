/* A static server that behaves like the deployed origin, so the service-worker
   tests exercise the redirect the real one performs rather than a friendlier
   local approximation. Cloudflare's `auto-trailing-slash` 307s /index.html to
   the directory form, and precaching that redirect is what broke iOS launches
   once already.

   node dist/tools/serve.js [port]   serve dist/ at /metronome/ */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const TYPES: Record<string, string> = {
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

interface ServerOptions {
  root?: string;
  mount?: string;
  missing?: Iterable<string>;
  files?: Record<string, string | Buffer>;
  redirectShell?: boolean;
  port?: number;
}

interface ServerState {
  missing: Set<string>;
  files: Map<string, string | Buffer>;
  redirectShell: boolean;
  offline: boolean;
}

interface ServerHandle {
  port: number;
  origin: string;
  url: string;
  state: ServerState;
  close: () => Promise<void>;
}

interface HeaderRule {
  pattern: string;
  headers: Record<string, string>;
}

/* Parses the Cloudflare _headers format: an unindented path pattern line
   followed by indented "Key: value" lines. Reads dist/_headers rather than
   hardcoding the policy a second time, so the browser tests exercise the CSP
   tools/inline.mjs actually wrote — hashes and all — instead of a copy that
   can drift from it. */
function parseHeaders(text: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  let current: HeaderRule | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^[ \t]/.test(line)) {
      current = { pattern: line.trim(), headers: {} };
      rules.push(current);
      continue;
    }
    if (!current) continue;
    const i = line.indexOf(":");
    if (i === -1) continue;
    current.headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return rules;
}

function matchesPattern(pattern: string, path: string): boolean {
  if (pattern.endsWith("*")) return path.startsWith(pattern.slice(0, -1));
  return path === pattern;
}

/* Rules are applied in file order and merged, so a later, more specific block
   overrides an earlier, broader one for the same header key — the convention
   _headers itself documents ("most-specific last"). */
function headersFor(rules: HeaderRule[], path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of rules) {
    if (matchesPattern(rule.pattern, path)) Object.assign(out, rule.headers);
  }
  return out;
}

export function startServer(
  options: ServerOptions = {},
): Promise<ServerHandle> {
  const root = options.root || ROOT;
  const mount = options.mount ?? "/metronome/";
  const headerRules = parseHeaders(
    readFileSync(join(root, "_headers"), "utf8"),
  );

  /* Mutable mid-test: a scenario turns a file off, swaps its bytes to simulate
     a deploy, or makes the directory form redirect too. */
  const state = {
    missing: new Set(options.missing || []),
    files: new Map(Object.entries(options.files || {})),
    redirectShell: !!options.redirectShell,
    offline: false,
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

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

    /* A path _headers names no rule for gets no extra header here either.
       Sending `no-store` as a fallback instead deadlocked the worker's
       precache: Chrome stalls a handful of the parallel fetches and the
       install never settles. */
    const extra = headersFor(headerRules, mount + rel);
    const ext = rel.slice(rel.lastIndexOf("."));
    res.writeHead(200, {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      "Content-Length": body.length,
      ...extra,
    });
    res.end(req.method === "HEAD" ? undefined : body);
  });

  return new Promise<ServerHandle>((ok) => {
    server.listen(options.port || 0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      ok({
        port,
        origin: `http://127.0.0.1:${port}`,
        url: `http://127.0.0.1:${port}${mount}`,
        state,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await startServer({ port: Number(process.argv[2]) || 8000 });
  console.log(`serving ${ROOT} at ${s.url}`);
}
