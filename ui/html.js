/* No build step means no JSX, so the markup is written with htm's tagged
   templates — the same shape, compiled in the browser at first use. */
import { h } from "../vendor/preact.module.js";
import htm from "../vendor/htm.module.js";

export const html = htm.bind(h);
