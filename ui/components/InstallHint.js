import { html } from "../html.js";

/* Share-sheet instructions, which only mean anything on a touch device: iOS
   has no programmatic install to offer instead. */
export function InstallHint({ onDismiss }) {
  return html`
    <div class="install">
      <span>
        Keep it on your home screen — tap Share, then
        <strong>Add to Home Screen</strong>.
      </span>
      <button aria-label="Dismiss" onClick=${onDismiss}>×</button>
    </div>
  `;
}
