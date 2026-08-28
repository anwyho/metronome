import { html } from "../html.js";

export function ShareButton({ copied, onShare }) {
  return html`
    <button
      class="share"
      data-copied=${copied ? "" : null}
      aria-label="Share this pattern"
      title=${copied ? "Copied" : "Share link"}
      onClick=${onShare}
    >
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"></path>
        <polyline points="16 6 12 2 8 6"></polyline>
        <line x1="12" y1="2" x2="12" y2="14"></line>
      </svg>
    </button>
  `;
}
