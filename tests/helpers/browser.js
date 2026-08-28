/* Full Chrome, not chrome-headless-shell: the shell binary has no service
   worker implementation, and half of what is worth testing here is the worker.
   `npx puppeteer browsers install chrome` provides one; CHROME_PATH, or a
   Chrome already on the machine, stands in when it is missing. */

import { existsSync } from "node:fs";
import puppeteer from "puppeteer";

const SYSTEM = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

function chrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  try {
    const bundled = puppeteer.executablePath();
    if (existsSync(bundled)) return bundled;
  } catch {}
  const found = SYSTEM.find((p) => existsSync(p));
  if (found) return found;
  throw new Error(
    "No Chrome found. Run `npx puppeteer browsers install chrome`, or set CHROME_PATH.",
  );
}

export function launch(options = {}) {
  return puppeteer.launch({
    headless: true,
    executablePath: chrome(),
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
