import { html } from "../html.js";

const MAX_SUB = 8;

export function SubdivisionControl({ sub, onChange }) {
  return html`
    <div class="field">
      <div class="field__head">
        <span class="field__label">clicks per beat</span>
        <span class="field__value"
          >${sub === 1 ? "one" : `${sub} per beat`}</span
        >
      </div>
      <div class="pill-track">
        ${Array.from(
          { length: sub },
          (_, i) => html`<div key=${i} class="sub-dot"></div>`,
        )}
      </div>
      <input
        class="slider"
        type="range"
        min="1"
        max=${MAX_SUB}
        step="1"
        value=${sub}
        aria-label="Clicks per beat"
        onInput=${(e) => onChange(parseInt(e.target.value, 10) || 1)}
      />
    </div>
  `;
}
