import { h } from "../../vendor/preact.module.js";

export function VolumeControl({
  volume,
  onChange,
}: {
  volume: number;
  onChange: (volume: number) => void;
}) {
  return (
    <div class="field">
      <div class="field__head">
        <span class="field__label">volume</span>
        <span class="field__meta">
          {volume === 0 ? "silent · visual only" : `${volume}%`}
        </span>
      </div>
      <input
        class="slider"
        type="range"
        min="0"
        max="100"
        step="1"
        value={volume}
        aria-label="Volume"
        onInput={(e) => onChange(parseInt(e.currentTarget.value, 10))}
      />
    </div>
  );
}
