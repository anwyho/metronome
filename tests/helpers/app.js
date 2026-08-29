/* Shared setup for the browser suites: one browser, a fresh storage context per
   test so a worker or a cache from one scenario cannot answer the next. */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "./browser.js";
import { startServer } from "../../tools/serve.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SW = readFileSync(join(ROOT, "sw.js"), "utf8");

export const VERSION = SW.match(/const VERSION = "([^"]+)"/)[1];
export const BUILD = SW.match(/const BUILD = "([^"]+)"/)[1];
export const PRECACHE = [...SW.matchAll(/^ {2}"([^"]+)",$/gm)].map((m) => m[1]);
export const INDEX = readFileSync(join(ROOT, "index.html"), "utf8");

export async function harness(options = {}) {
  const server = await startServer(options);
  const browser = await launch();
  return {
    server,
    browser,
    async page() {
      const context = await browser.createBrowserContext();
      /* The `errors` array below is not part of puppeteer's Page; naming it
         here is what lets a .ts spec read it. */
      const page =
        /** @type {import("puppeteer").Page & { errors: string[] }} */ (
          await context.newPage()
        );
      /* Pinned so 'system' resolves the same way whatever the host machine's
         appearance is set to; otherwise the theme tests only pass in Light. */
      await page.emulateMediaFeatures([
        { name: "prefers-color-scheme", value: "light" },
      ]);
      page.errors = [];
      page.on("pageerror", (e) => page.errors.push(e.message));
      return page;
    },
    async close() {
      await browser.close();
      await server.close();
    },
  };
}

/* Resolves false rather than hanging when the install is meant to fail. */
export async function workerActive(page, timeout = 10000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const active = await page.evaluate(() =>
      navigator.serviceWorker
        .getRegistrations()
        .then((rs) => rs.some((r) => !!r.active)),
    );
    if (active) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

export const settle = (page, frames = 3) =>
  page.evaluate(
    (n) =>
      new Promise((done) => {
        const step = () => (n-- > 0 ? requestAnimationFrame(step) : done());
        step();
      }),
    frames,
  );

/* The app carries no test hooks; its controls are found the way a reader finds
   them — by the words on them, or by the label a screen reader would read. */
export const rectOfText = (page, text) =>
  page.evaluate((t) => {
    const el = [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === t,
    );
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      bottom: r.bottom,
    };
  }, text);

export const rectOf = (page, selector) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      bottom: r.bottom,
    };
  }, selector);
