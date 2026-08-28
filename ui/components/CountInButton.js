import { html } from "../html.js";

const label = (count) =>
  count === 0
    ? "No\ncount-in"
    : count === 1
      ? "Count-in\n1 beat"
      : `Count-in\n${count} beats`;

export function CountInButton({ count, onCycle }) {
  return html`
    <button
      class="count-in"
      aria-pressed=${count ? "true" : "false"}
      onClick=${onCycle}
    >
      ${label(count)}
    </button>
  `;
}
