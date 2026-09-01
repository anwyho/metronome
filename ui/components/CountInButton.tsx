import { h } from "../../vendor/preact.module.js";

const label = (count: number): string =>
  count === 0
    ? "No\ncount-in"
    : count === 1
      ? "Count-in\n1 beat"
      : `Count-in\n${count} beats`;

export function CountInButton({
  count,
  onCycle,
}: {
  count: number;
  onCycle: () => void;
}) {
  return (
    <button
      class="count-in"
      aria-pressed={count ? "true" : "false"}
      onClick={onCycle}
    >
      {label(count)}
    </button>
  );
}
