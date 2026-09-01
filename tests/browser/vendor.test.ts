import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { harness } from "../helpers/app.js";

type Harness = Awaited<ReturnType<typeof harness>>;

/* Proves the no-build path end to end: the browser resolves the vendored
   modules by itself, with no import map and no bundler, because vendor.mjs
   rewrote the one bare specifier they contain. External, not inline, so the
   deployed CSP's script-src (no 'unsafe-inline') does not stand in for the
   thing this test is actually proving. */
const PROBE = `<!doctype html><meta charset="utf-8"><div id="root"></div>
<script type="module" src="probe.js"></script>`;
const PROBE_JS = `
  import { h, render } from "./vendor/preact.module.js";
  import { useState } from "./vendor/hooks.module.js";
  const App = () => {
    const [n] = useState(3);
    return h("p", null, "rendered " + n);
  };
  render(h(App), document.getElementById("root"));
`;

describe("vendored modules", () => {
  let h: Harness;
  before(async () => {
    h = await harness({
      files: { "probe.html": PROBE, "probe.js": PROBE_JS },
    });
  });
  after(() => h.close());

  it("renders through preact with no import map", async () => {
    const page = await h.page();
    await page.goto(h.server.url + "probe.html", {
      waitUntil: "networkidle0",
    });
    assert.deepEqual(page.errors, []);
    assert.equal(
      await page.evaluate(() => document.getElementById("root")!.textContent),
      "rendered 3",
    );
    await page.close();
  });
});
