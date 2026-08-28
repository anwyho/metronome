/* The offline shell strategy, as a worker runtime. A classic script, imported
   by the project's own `sw.js` with `importScripts` — imported scripts join the
   worker's stored script resources, so a cold offline start does not need the
   network to find this file.

   Not a module worker: those are Safari 16.4+, and there is nothing to gain
   from requiring it.

   Call it once, at the top level of sw.js:

     importScripts("pwa/sw-runtime.js");
     offlineWorker({ version: VERSION, build: BUILD, precache: PRECACHE,
                     cachePrefix: "metronome-" });

   `shell` is the URL the precache stores the document under, and it must be
   the directory form, './', not 'index.html'. An origin that redirects
   /index.html to the directory — Cloudflare's `auto-trailing-slash` does —
   resolves a fetch of it with the redirect flag set, and a response carrying
   that flag is rejected outright when it answers a navigation. iOS reports
   "Response served by service worker has redirections" and the app does not
   launch at all. */

self.offlineWorker = function offlineWorker(config) {
  const { version, build, precache, cachePrefix, shell = "./" } = config;
  const CACHE = cachePrefix + build;

  /* A response that followed a redirect carries a flag the browser refuses for
     a navigation, and nothing here wants the flag — only the bytes. Rebuilding
     the response drops it. Left alone otherwise: an opaqueredirect reports
     false and must stay intact, since its body cannot be read. */
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
     precache is filled by hand. A file that does not come back ok fails the
     whole install: a cache that claims to be complete and is not stalls the app
     on its next cold launch, offline, with no way to notice from here. */
  async function precacheAll(cache) {
    /* Every fetch settles before anything is written, so a failure leaves the
       cache untouched rather than half-filled — what addAll gave us for free. */
    const entries = await Promise.all(
      precache.map(async (url) => {
        const res = await fetch(new Request(url, { cache: "reload" }));
        if (!res.ok) throw new Error("precache " + url + " -> " + res.status);
        return [url, unredirected(res)];
      }),
    );
    await Promise.all(entries.map(([url, res]) => cache.put(url, res)));
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

  /* The document this navigation is creating does not exist yet, and matchAll
     answers with the one it replaces — which is torn down before it can read
     anything. clients.get() on the reserved id stays empty until the new
     document is there to hear it. */
  async function clientFor(id) {
    for (let i = 0; id && i < 30; i++) {
      const client = await self.clients.get(id);
      if (client) return [client];
      await new Promise((r) => setTimeout(r, 100));
    }
    return self.clients.matchAll();
  }

  /* Compare what was just served against a fresh copy, and speak up only if the
     bytes differ. Freshness is deliberately not the fetch strategy: paying
     network latency on every launch to catch a deploy-day change is the trade
     that makes a slow network feel like a broken app. */
  async function refreshShell(servedCopy, clientId) {
    const served = await servedCopy.text();
    const res = await fetch(shell, { cache: "no-store" });
    if (!res.ok) return;
    const fresh = res.clone();
    const text = await res.text();
    if (text === served) return;
    await (await caches.open(CACHE)).put(shell, unredirected(fresh));
    for (const client of await clientFor(clientId)) {
      client.postMessage({ type: "content-updated" });
    }
  }

  /* The page asks on load so it can show which build it is running, and again
     after a check. */
  self.addEventListener("message", (event) => {
    if (!event.data || event.data.type !== "version") return;
    const reply = { type: "version", version, build };
    if (event.ports && event.ports[0]) event.ports[0].postMessage(reply);
    else if (event.source) event.source.postMessage(reply);
  });

  self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET") return;
    if (new URL(req.url).origin !== self.location.origin) return;

    /* Navigations are cache-first, never network-first. A network that is up
       and crawling does not reject a fetch, it hangs, so a network-first shell
       with a cache fallback stalls for exactly as long as the network is
       slow. */
    if (req.mode === "navigate") {
      event.respondWith(
        (async () => {
          const cache = await caches.open(CACHE);
          const hit = await cache.match(shell);
          if (hit) {
            /* Clone before returning: once the response is handed to
               respondWith its body is locked and clone() throws — inside
               waitUntil, where the rejection is invisible and the cache
               silently stops refreshing. */
            event.waitUntil(
              refreshShell(hit.clone(), event.resultingClientId).catch(
                () => {},
              ),
            );
            /* Clone first: unredirected() reads the body to rebuild it. */
            return unredirected(hit);
          }
          try {
            return unredirected(await fetch(req));
          } catch {
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
};
