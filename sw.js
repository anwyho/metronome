/* Offline-first worker for the metronome.
   The block below is generated — run `node tools/build.mjs` after changing any
   shipped file. `node tools/build.mjs --check` fails if stale.

   VERSION is the calendar date, for humans. BUILD hashes every precached byte
   and the precache list, and is what actually keys the cache: two deploys on
   one day share a VERSION, so keying on it would leave sw.js identical and the
   update would never ship. */

/* @generated-begin */
const VERSION = '260827.2325';
const BUILD = '7809758eb1db';
const PRECACHE = [
  './',
  'app.js',
  'ds/styles.css',
  'fonts/caprasimo-latin.woff2',
  'fonts/figtree-latin.woff2',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'manifest.webmanifest',
  'metronome-core.js',
  'support.js',
  'vendor/preact-compat.umd.js',
  'vendor/preact-hooks.umd.js',
  'vendor/preact.umd.js',
];
/* @generated-end */

const CACHE = "metronome-" + BUILD;
/* './', not 'index.html': the origin 307s /index.html to the directory form, so
   a fetch of it resolves with the redirect flag set, and a response carrying
   that flag is rejected outright when it answers a navigation. */
const SHELL = "./";

/* A response that followed a redirect carries a flag the browser refuses for a
   navigation, and nothing here wants the flag — only the bytes. Rebuilding the
   response drops it. Left alone otherwise: an opaqueredirect reports false and
   must stay intact, since its body cannot be read. */
function unredirected(res) {
  return res.redirected
    ? new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      })
    : res;
}

/* addAll would store whatever a redirect resolved to, flag and all, so the
   precache is filled by hand. A file that does not come back ok still fails the
   whole install: a cache that claims to be complete and is not stalls the app
   on its next cold launch, offline, with no way to notice from here. */
async function precacheAll(cache) {
  /* Every fetch settles before anything is written, so a failure leaves the
     cache untouched rather than half-filled — what addAll gave us for free. */
  const entries = await Promise.all(
    PRECACHE.map(async (u) => {
      const res = await fetch(new Request(u, { cache: "reload" }));
      if (!res.ok) throw new Error("precache " + u + " -> " + res.status);
      return [u, unredirected(res)];
    }),
  );
  await Promise.all(entries.map(([u, res]) => cache.put(u, res)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(precacheAll)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/* Compare what we just served against a fresh copy, and speak up only if the
   bytes differ. Freshness is deliberately not the fetch strategy: paying
   network latency on every launch to catch a deploy-day change is the trade
   that makes a slow network feel like a broken app. */
async function refreshShell(servedCopy) {
  const served = await servedCopy.text();
  const res = await fetch(SHELL, { cache: "no-store" });
  if (!res.ok) return;
  const fresh = res.clone();
  const text = await res.text();
  if (text === served) return;
  await (await caches.open(CACHE)).put(SHELL, unredirected(fresh));
  for (const client of await self.clients.matchAll()) {
    client.postMessage({ type: "content-updated" });
  }
}

/* The page asks on load so it can show which build it is running, and again
   after a manual check. */
self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "version") return;
  const reply = { type: "version", version: VERSION, build: BUILD };
  if (event.ports && event.ports[0]) event.ports[0].postMessage(reply);
  else if (event.source) event.source.postMessage(reply);
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* Navigations are cache-first, never network-first. A network that is up and
     crawling does not reject a fetch, it hangs, so a network-first shell with a
     cache fallback stalls for exactly as long as the network is slow. */
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(SHELL);
        if (hit) {
          /* Clone before returning: once the response is handed to respondWith
           its body is locked and clone() throws — inside waitUntil, where the
           rejection is invisible and the cache silently stops refreshing. */
          event.waitUntil(refreshShell(hit.clone()).catch(() => {}));
          /* Clone first: unredirected() reads the body to rebuild it. */
          return unredirected(hit);
        }
        try {
          return unredirected(await fetch(req));
        } catch (e) {
          return new Response("Offline and nothing cached yet.", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          });
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.type === "basic") cache.put(req, res.clone());
      return res;
    })(),
  );
});
