import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import {
  BUILD,
  INDEX,
  PRECACHE,
  VERSION,
  harness,
  workerActive,
} from "../helpers/app.js";

type Harness = Awaited<ReturnType<typeof harness>>;
type TestPage = Awaited<ReturnType<Harness["page"]>>;

const CACHE = "metronome-" + BUILD;

describe("service worker", () => {
  let h: Harness;
  before(async () => {
    h = await harness();
  });
  after(() => h.close());

  const load = async (page: TestPage) => {
    await page.goto(h.server.url, { waitUntil: "domcontentloaded" });
    return workerActive(page);
  };

  /* Relative to where the app is mounted. The app has a `metronome/` directory
     of its own, so trimming to the last "metronome/" would eat it. */
  const cacheKeys = (page: TestPage) =>
    page.evaluate(
      async (name, base) => {
        const names = await caches.keys();
        if (!names.includes(name)) return null;
        const cache = await caches.open(name);
        const keys = await cache.keys();
        return keys.map((r) => new URL(r.url).pathname.slice(base.length));
      },
      CACHE,
      new URL(h.server.url).pathname,
    );

  it("precaches every shipped file under a build-keyed name", async () => {
    const page = await h.page();
    assert.ok(await load(page), "the worker activated");

    const cached = await cacheKeys(page);
    assert.ok(cached, `there is a ${CACHE} cache`);
    const want = PRECACHE.map((p) => (p === "./" ? "" : p)).sort();
    assert.deepEqual(cached.map((p) => (p === "./" ? "" : p)).sort(), want);

    const version = await page.evaluate(() => window.__swInfo);
    assert.equal(version.version, VERSION);
    assert.equal(version.build, BUILD);
    await page.close();
  });

  it("stores the shell unredirected, even where the directory form redirects", async () => {
    h.server.state.redirectShell = true;
    try {
      const page = await h.page();
      assert.ok(await load(page), "the worker activated behind the redirect");

      const shell = await page.evaluate(async (name) => {
        const hit = await (await caches.open(name)).match("./");
        return hit && { ok: hit.ok, redirected: hit.redirected };
      }, CACHE);
      /* A response carrying the redirect flag is rejected outright when it
         answers a navigation, and iOS refuses to launch the app at all. */
      assert.deepEqual(shell, { ok: true, redirected: false });

      await page.reload({ waitUntil: "domcontentloaded" });
      assert.match(await page.evaluate(() => document.body.innerText), /Start/);
      assert.deepEqual(page.errors, []);
      await page.close();
    } finally {
      h.server.state.redirectShell = false;
    }
  });

  it("fails the install and leaves nothing cached when a file is missing", async () => {
    /* Taken from the list rather than named, so renaming a file cannot quietly
       turn this scenario into "nothing was missing". */
    const victim = PRECACHE.find((p) => p !== "./");
    assert.ok(victim, "the precache has a file to remove");
    h.server.state.missing.add(victim);
    try {
      const page = await h.page();
      assert.equal(await load(page), false, "the install did not complete");
      /* A cache that claims to be complete and is not strands the next cold
         launch offline with no way to notice from here. Whether the failed
         install left the cache behind empty or dropped it is the browser's
         business; what matters is that nothing is in it. */
      assert.deepEqual((await cacheKeys(page)) ?? [], []);
      await page.close();
    } finally {
      h.server.state.missing.delete(victim);
    }
  });

  it("launches with no network at all", async () => {
    const page = await h.page();
    assert.ok(await load(page));

    await page.setOfflineMode(true);
    h.server.state.offline = true;
    try {
      await page.reload({ waitUntil: "domcontentloaded" });
      assert.match(await page.evaluate(() => document.body.innerText), /Start/);
    } finally {
      h.server.state.offline = false;
      await page.setOfflineMode(false);
    }
    await page.close();
  });

  it("notices a deploy that only changed the shell", async () => {
    const page = await h.page();
    assert.ok(await load(page));
    assert.equal(await page.evaluate(() => window.__swInfo.update), false);

    /* The worker refetches the shell behind every launch and speaks up only
       when the bytes differ, so a deploy that changed nothing stays quiet. */
    h.server.state.files.set(
      "index.html",
      INDEX.replace("</head>", "<!-- v2 --></head>"),
    );
    try {
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => window.__swInfo && window.__swInfo.update === true,
        {
          timeout: 10000,
        },
      );
    } finally {
      h.server.state.files.delete("index.html");
    }
    await page.close();
  });

  it("stays quiet when the deploy changed nothing", async () => {
    const page = await h.page();
    assert.ok(await load(page));
    await page.reload({ waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(await page.evaluate(() => window.__swInfo.update), false);
    await page.close();
  });
});
