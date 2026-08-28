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

  it("moves one bpm on a tap and accelerates on a hold", async () => {
    await open("#bpm=100&beats=Xooo&sub=1");
    const bpm = () =>
      page.evaluate(() =>
        parseInt(document.querySelector(".tempo__input").value, 10),
      );

    await press('[aria-label="Increase tempo"]');
    assert.equal(await bpm(), 101, "a tap is worth exactly one");

    const button = await page.$('[aria-label="Increase tempo"]');
    const box = await button.boundingBox();
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await new Promise((r) => setTimeout(r, 250));
    const early = await bpm();
    await new Promise((r) => setTimeout(r, 1200));
    const late = await bpm();
    await page.mouse.up();
    await settle(page, 4);
    const released = await bpm();

    assert.equal(early, 102, "nothing repeats before the hold delay is up");
    assert.ok(late - early > 5, `only ${late - early} in the next 1.2s`);
    /* Slow at the start and faster later, so the opening of a hold is still
       usable for a nudge. */
    assert.ok(late - early < 60, `${late - early} in 1.2s is a runaway`);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(await bpm(), released, "releasing stops it");
  });

  it("stops the hold when the pointer leaves the button", async () => {
    await open("#bpm=100&beats=Xooo&sub=1");
    const bpm = () =>
      page.evaluate(() =>
        parseInt(document.querySelector(".tempo__input").value, 10),
      );
    const box = await (
      await page.$('[aria-label="Decrease tempo"]')
    ).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await new Promise((r) => setTimeout(r, 800));
    await page.mouse.move(box.x + box.width / 2, box.y - 80);
    await settle(page, 4);
    const left = await bpm();
    assert.ok(left < 99, "the hold was repeating before the pointer left");
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(await bpm(), left);
    await page.mouse.up();
  });

  it("adds beats on a hold, one at a time at first", async () => {
    await open("#bpm=100&beats=Xooo&sub=1");
    const count = () =>
      page.evaluate(() => document.querySelectorAll(".cell__dot").length);

    await press('[aria-label="More beats"]');
    assert.equal(await count(), 5, "a tap adds exactly one");

    const box = await (await page.$('[aria-label="More beats"]')).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(await count(), 6, "nothing repeats before the hold delay");
    await new Promise((r) => setTimeout(r, 1000));
    const held = await count();
    await page.mouse.up();
    await settle(page, 4);

    assert.ok(held > 7, `only reached ${held} beats`);
    /* The tempo's ceiling would have hit 24 within a frame of the first
       repeat; this one is scaled to the range it drives. */
    assert.ok(held < 24, `reached the end of the range at ${held}`);
    const released = await count();
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(await count(), released, "releasing stops it");
  });

  it("stops at the ends of the beat range", async () => {
    await open("#bpm=100&beats=Xooo&sub=1");
    const box = await (
      await page.$('[aria-label="Fewer beats"]')
    ).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await new Promise((r) => setTimeout(r, 2500));
    await page.mouse.up();
    await settle(page, 4);
    assert.equal(
      await page.evaluate(() => document.querySelectorAll(".cell__dot").length),
      2,
    );
    assert.deepEqual(page.errors, []);
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
    const swingName = () =>
      page.evaluate(() =>
        document.querySelectorAll(".field__value")[1].textContent.trim(),
      );
    await drag("Swing", 67);
    assert.equal(await swingName(), "Swing");
    /* Under 50 the off-tick lands early, and the name says which side of
       straight it is on. */
    await drag("Swing", 33);
    assert.equal(await swingName(), "Reverse swing");
    await drag("Swing", 5);
    assert.equal(await swingName(), "5%");
    assert.deepEqual(
      await page.evaluate(() => {
        const el = document.querySelector('input[aria-label="Swing"]');
        return { min: el.min, max: el.max };
      }),
      { min: "5", max: "95" },
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
