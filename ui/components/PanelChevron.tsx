import type { RefObject } from "preact";
import { h } from "../../vendor/preact.module.js";
import { useEffect, useState } from "../../vendor/hooks.module.js";

/* The panel is the second scroll-snap page, and this is the only thing on
   screen that says so — so it stays pinned above the fold and turns to point
   back the way it came once the panel is up. Pressing it is a shortcut for the
   scroll, in whichever direction the scroll has not gone yet. */
export function PanelChevron({
  shell,
}: {
  shell: RefObject<HTMLDivElement | null>;
}) {
  const [atPanel, setAtPanel] = useState(false);

  useEffect(() => {
    const el = shell.current;
    if (!el) return;
    const read = () => {
      const max = el.scrollHeight - el.clientHeight;
      setAtPanel(max > 0 && el.scrollTop > max / 2);
    };
    read();
    el.addEventListener("scroll", read, { passive: true });
    addEventListener("resize", read);
    return () => {
      el.removeEventListener("scroll", read);
      removeEventListener("resize", read);
    };
  }, [shell]);

  const go = () => {
    const el = shell.current;
    if (el) el.scrollTo({ top: atPanel ? 0 : el.scrollHeight });
  };

  return (
    <button
      class="chevron"
      data-up={atPanel ? "" : null}
      aria-label={atPanel ? "Back to the metronome" : "More settings"}
      onClick={go}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </button>
  );
}
