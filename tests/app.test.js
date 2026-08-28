import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { harness, settle } from "./helpers/app.js";

describe("app", () => {
  let h;
  let page;

  before(async () => {
    h = await harness();
    page = await h.page();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  });
  after(() => h.close());

  const open = async (hash = "") => {
    /* Through about:blank, so each test gets a real load. Navigating straight
       from one hash to another only fires hashchange, and the app carries on
       with the state — and the pending debounced write — of the test before. */
    await page.goto("about:blank");
    await page.goto(h.server.url + hash, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => /beats/.test(document.body.innerText));
    await settle(page, 3);
  };
  const press = async (selector) => {
    await page.click(selector);
    await settle(page, 3);
  };
  const pressText = async (label) => {
    await page.evaluate(
      (l) =>
        [...document.querySelectorAll("button")]
          .find((b) => b.textContent.trim() === l)
          .click(),
      label,
    );
    await settle(page, 3);
  };
  const drag = async (label, value) => {
    await page.evaluate(
      (l, v) => {
        const input = document.querySelector(`input[aria-label="${l}"]`);
        input.value = v;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      },
      label,
      value,
    );
    await settle(page, 3);
  };
  const text = (selector) =>
    page.evaluate(
      (s) => document.querySelector(s).textContent.trim(),
      selector,
    );

  it("moves and names the tempo", async () => {
    await open("#bpm=100&beats=Xooo&sub=1");
    assert.equal(await text(".tempo__marking"), "Andante");
    await press('[aria-label="Increase tempo"]');
    assert.equal(
      await page.evaluate(() => document.querySelector(".tempo__input").value),
      "101",
    );
    await press('[aria-label="Decrease tempo"]');
    await press('[aria-label="Decrease tempo"]');
    assert.equal(
      await page.evaluate(() => document.querySelector(".tempo__input").value),
      "99",
    );
  });

  it("cycles a beat and writes it into the link", async () => {
    await open("#bpm=100&beats=Xooo&sub=1");
    await press('[aria-label="Beat 2, beat"]');
    assert.equal(
      await page.evaluate(
        () => document.querySelectorAll(".cell__dot")[1].dataset.level,
      ),
      "minor",
    );
    await press('[aria-label="More beats"]');
    assert.equal(await text(".beats__count span"), "5 beats");
    /* Writing the hash is debounced, so a drag does not push a history entry
       per pixel. */
    await page.waitForFunction(
      () => location.hash === "#bpm=100&beats=Xxooo&sub=1",
    );
  });

  it("runs the transport and freezes the readout on stop", async () => {
    await open("#bpm=600&beats=Xooo&sub=1");
    assert.equal(await text(".counters"), "");
    await pressText("Start");
    assert.equal(await text(".start"), "Stop");
    await page.waitForFunction(
      () => document.querySelector(".cell__dot[data-live]") !== null,
      { timeout: 5000 },
    );
    await page.waitForFunction(() =>
      /bars/.test(document.querySelector(".counters").textContent),
    );
    const running = await text(".counters");
    await pressText("Stop");
    assert.equal(await text(".start"), "Start");
    await settle(page, 6);
    assert.equal(
      await text(".counters"),
      running.replace(/^\S+/, (t) => t),
    );
    assert.equal(
      await page.evaluate(() =>
        document.querySelector(".cell__dot[data-live]"),
      ),
      null,
    );
  });

  it("enables swing only where the subdivision can carry it", async () => {
    await open("#bpm=100&beats=Xooo&sub=1");
    const disabled = () =>
      page.evaluate(
        () => document.querySelector('input[aria-label="Swing"]').disabled,
      );
    assert.equal(await disabled(), true);
    await drag("Clicks per beat", 3);
    assert.equal(await disabled(), true);
    await drag("Clicks per beat", 4);
    assert.equal(await disabled(), false);
    await drag("Swing", 67);
    assert.equal(
      await page.evaluate(() =>
        document.querySelectorAll(".field__value")[1].textContent.trim(),
      ),
      "Swing",
    );
    /* Dropping back to a subdivision that cannot swing leaves the value in the
       link but stops applying it. */
    await drag("Clicks per beat", 3);
    assert.equal(await disabled(), true);
  });

  it("says what silence means", async () => {
    await open();
    await drag("Volume", 0);
    assert.equal(await text(".field__meta"), "silent · visual only");
  });

  it("cycles the theme and stamps it before the app renders", async () => {
    await open();
    const theme = () =>
      page.evaluate(() => ({
        stamped: document.documentElement.dataset.theme,
        label: document.querySelector(".theme").textContent.trim(),
      }));
    assert.deepEqual(await theme(), { stamped: "light", label: "System" });
    await press(".theme");
    assert.deepEqual(await theme(), { stamped: "light", label: "Light" });
    await press(".theme");
    assert.deepEqual(await theme(), { stamped: "dark", label: "Dark" });
    /* The stylesheet has no prefers-color-scheme query, so a settled attribute
       on <html> is the only thing that can have made this dark. */
    assert.equal(
      await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      ),
      "rgb(26, 23, 20)",
    );
    await press(".theme");
    assert.deepEqual(await theme(), { stamped: "light", label: "System" });
  });

  it("restores the pattern a link carries", async () => {
    await open("#bpm=144&beats=Xxo.Xo&sub=2&swing=60");
    assert.equal(
      await page.evaluate(() => document.querySelector(".tempo__input").value),
      "144",
    );
    assert.deepEqual(
      await page.evaluate(() =>
        [...document.querySelectorAll(".cell__dot")].map(
          (d) => d.dataset.level,
        ),
      ),
      ["accent", "minor", "normal", "muted", "accent", "normal"],
    );
    assert.equal(
      await page.evaluate(
        () => document.querySelector('input[aria-label="Swing"]').value,
      ),
      "60",
    );
  });

  it("renders without a single page error", async () => {
    assert.deepEqual(page.errors, []);
  });
});
