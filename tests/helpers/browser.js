/* Full Chrome, not chrome-headless-shell: the shell binary has no service
   worker implementation, and half these tests are about the worker. Puppeteer
   downloads a matching build on install; CHROME_PATH overrides it. */
import puppeteer from "puppeteer";

export function launch(options = {}) {
  return puppeteer.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || undefined,
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
    ...options,
  });
}

/* Synthetic blur / visibilitychange are dispatched on the document but read by
   window handlers, so they only arrive if they are allowed to bubble. */
export const dispatch = (page, type, target = "document") =>
  page.evaluate(
    (t, tgt) =>
      (tgt === "document" ? document : window).dispatchEvent(
        new Event(t, { bubbles: true }),
      ),
    type,
    target,
  );

export async function waitForActiveWorker(page, timeout = 15000) {
  await page.waitForFunction(
    () =>
      navigator.serviceWorker.controller ||
      navigator.serviceWorker.ready.then(() => true),
    { timeout },
  );
  return page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return { scriptURL: reg.active && reg.active.scriptURL };
  });
}
