import { html } from "../html.js";

export function VolumeControl({ volume, onChange }) {
  return html`
    <div class="field">
      <div class="field__head">
        <span class="field__label">volume</span>
        <span class="field__meta">
          ${volume === 0 ? "silent · visual only" : `${volume}%`}
        </span>
      </div>
      <input
        class="slider"
        type="range"
        min="0"
        max="100"
        step="1"
        value=${volume}
        aria-label="Volume"
        onInput=${(e) => onChange(parseInt(e.target.value, 10))}
      />
    </div>
  `;
}
