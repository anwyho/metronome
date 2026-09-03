import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { harness, rectOf, rectOfText, settle } from "../helpers/app.js";

type Harness = Awaited<ReturnType<typeof harness>>;
type TestPage = Awaited<ReturnType<Harness["page"]>>;

/* 553 is an SE and 629 a mini, both with the Safari toolbars showing; the rest
   are the common iPhone viewports. 629 is the height that broke once. */
const HEIGHTS = [553, 629, 667, 745, 812];
const WIDTH = 390;

const pattern = (n: number) => "X" + "o".repeat(n - 1);

describe("layout", () => {
  let h: Harness;
  before(async () => {
    h = await harness();
  });
  after(() => h.close());

  async function open(height = 874, hash = "") {
    const page = await h.page();
    await page.setViewport({ width: WIDTH, height, deviceScaleFactor: 2 });
    await page.goto(h.server.url + hash, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => /beats/.test(document.body.innerText));
    await settle(page);
    return page;
  }

  async function setBeats(page: TestPage, n: number) {
    await page.evaluate((p) => {
      location.hash = "bpm=100&beats=" + p + "&sub=1";
    }, pattern(n));
    await page.waitForFunction(
      (n) => document.body.innerText.includes(n + " beats"),
      {},
      n,
    );
    await settle(page);
  }

  it("never moves the tempo or the transport as beats are added", async () => {
    const page = await open();
    await setBeats(page, 2);
    const tempo = await rectOf(page, 'input[aria-label="Beats per minute"]');
    const start = await rectOfText(page, "Start");
    const tap = await rectOfText(page, "Tap");

    for (let n = 3; n <= 24; n++) {
      await setBeats(page, n);
      /* Sizing the grid to its rows would slide the tempo and the transport
         under the finger as beats are added; the box is one height per
         viewport and the cells shrink inside it. */
      assert.deepEqual(
        await rectOf(page, 'input[aria-label="Beats per minute"]'),
        tempo,
        `tempo moved at ${n} beats`,
      );
      assert.deepEqual(
        await rectOfText(page, "Start"),
        start,
        `transport at ${n}`,
      );
      assert.deepEqual(await rectOfText(page, "Tap"), tap, `tap at ${n}`);
    }
    await page.close();
  });

  for (const height of HEIGHTS) {
    it(`fits the whole first screen at ${height}px`, async () => {
      const page = await open(height);
      for (const n of [2, 6, 12, 24]) {
        await setBeats(page, n);
        const chevron = await rectOf(page, '[aria-label="More settings"]');
        const start = await rectOfText(page, "Start");
        assert.ok(chevron, "the panel chevron is on the page");
        assert.ok(start, "the transport is on the page");
        assert.ok(
          chevron.bottom <= height,
          `${n} beats pushed the chevron to ${chevron.bottom}, past ${height}`,
        );
        assert.ok(
          start.bottom <= chevron.y,
          `${n} beats put the transport over the chevron`,
        );
        assert.ok(start.y >= 0, `${n} beats pushed the transport off the top`);
      }
      await page.close();
    });
  }

  it("keeps the chevron on screen and turns it around at the panel", async () => {
    const page = await open(667);
    const state = () =>
      page.evaluate(() => {
        const shell = document.querySelector(".shell")!;
        const chevron = document.querySelector(".chevron")!;
        const box = chevron.getBoundingClientRect();
        return {
          label: chevron.getAttribute("aria-label"),
          /* Sticky, so it is in the same place on both pages — give or take
             the fraction of a pixel the scroll height rounds away. */
          bottom: Math.round(box.bottom),
          turned: getComputedStyle(chevron.querySelector("svg")!).transform,
          scrollTop: Math.round(shell.scrollTop),
        };
      });

    const closed = await state();
    assert.equal(closed.label, "More settings");
    assert.equal(closed.scrollTop, 0);

    await page.click(".chevron");
    await settle(page, 40);
    const opened = await state();
    assert.equal(opened.label, "Back to the metronome");
    assert.ok(opened.scrollTop > 0, "the press scrolled to the panel");
    assert.ok(
      Math.abs(opened.bottom - closed.bottom) <= 1,
      `the chevron moved from ${closed.bottom} to ${opened.bottom}`,
    );
    assert.notEqual(opened.turned, closed.turned, "the chevron did not flip");

    /* The way back is the same press. */
    await page.click(".chevron");
    await settle(page, 40);
    const { bottom, ...back } = await state();
    const { bottom: was, ...first } = closed;
    assert.deepEqual(back, first);
    await page.close();
  });

  it("puts the panel beside the transport once there is room", async () => {
    const page = await h.page();
    await page.setViewport({ width: 1100, height: 800, deviceScaleFactor: 2 });
    await page.goto(h.server.url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => /beats/.test(document.body.innerText));
    await settle(page, 4);

    const side = await page.evaluate(() => {
      const main = document.querySelector(".main")!.getBoundingClientRect();
      const panel = document.querySelector(".panel")!.getBoundingClientRect();
      const chevron = document.querySelector(".chevron")!;
      return {
        beside: panel.left >= main.right,
        /* Nothing below to scroll to, so the affordance that scrolls there has
           no business being on screen. */
        chevron: getComputedStyle(chevron).display,
        /* The column is content-sized here, so a grid that only takes what is
           left over takes nothing and the beats collapse to a rash of dots.
           Laid-out width, not the drawn one — a cell is still scaling in. */
        cell: document.querySelector<HTMLElement>(".cell")!.offsetWidth,
      };
    });
    assert.deepEqual(side, { beside: true, chevron: "none", cell: 56 });
    await page.close();
  });

  it("keeps every panel row the same height at every subdivision", async () => {
    const page = await open();
    const rows = async () =>
      page.evaluate(() => {
        let panel = document.querySelector(
          'input[aria-label="Clicks per beat"]',
        );
        while (panel && !panel.querySelector?.('input[aria-label="Volume"]'))
          panel = panel.parentElement;
        const top = panel!.getBoundingClientRect().top;
        return [...panel!.children].map((c) => {
          const r = c.getBoundingClientRect();
          return {
            offset: +(r.top - top).toFixed(2),
            height: +r.height.toFixed(2),
          };
        });
      });

    const setSub = async (n: number) => {
      await page.evaluate((n) => {
        location.hash = "bpm=100&beats=Xooo&sub=" + n;
      }, n);
      await settle(page, 4);
    };

    await setSub(1);
    const baseline = await rows();
    assert.ok(baseline.length > 3, "the panel has rows to compare");
    for (let sub = 2; sub <= 8; sub++) {
      await setSub(sub);
      /* The swing name slot holds a line box whether or not there is a name in
         it. Without one the row loses its baseline, the heading rides up, and
         everything below shifts — read as the volume track changing thickness. */
      assert.deepEqual(
        await rows(),
        baseline,
        `panel moved at ${sub} clicks per beat`,
      );
    }
    await page.close();
  });
});
