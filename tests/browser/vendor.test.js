import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { harness } from "../helpers/app.js";

/* Proves the no-build path end to end: the browser resolves the vendored
   modules by itself, with no import map and no bundler, because vendor.mjs
   rewrote the one bare specifier they contain. */
const PROBE = `<!doctype html><meta charset="utf-8"><div id="root"></div>
<script type="module">
  import { h, render } from "./vendor/preact.module.js";
  import { useState } from "./vendor/hooks.module.js";
  import htm from "./vendor/htm.module.js";
  const html = htm.bind(h);
  const App = () => {
    const [n] = useState(3);
    return html\`<p>rendered \${n}</p>\`;
  };
  render(h(App), document.getElementById("root"));
</script>`;

describe("vendored modules", () => {
  let h;
  before(async () => {
    h = await harness({ files: { "probe.html": PROBE } });
  });
  after(() => h.close());

  it("render through htm with no import map", async () => {
    const page = await h.page();
    await page.goto(h.server.url + "probe.html", { waitUntil: "networkidle0" });
    assert.deepEqual(page.errors, []);
    assert.equal(
      await page.evaluate(() => document.getElementById("root").textContent),
      "rendered 3",
    );
    await page.close();
  });
});
