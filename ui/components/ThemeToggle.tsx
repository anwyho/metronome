import type { ThemePref } from "../../metronome/prefs.js";
import { h } from "../../vendor/preact.module.js";
import { useTheme } from "../hooks/useTheme.js";

interface Theme {
  label: string;
  icon: string;
}

/* Single-path Lucide sun-moon / sun / moon, so the icon is one bound attribute
   rather than three conditional blocks. */
const THEMES: Record<ThemePref, Theme> = {
  system: {
    label: "System",
    icon: "M12 8a2.83 2.83 0 0 0 4 4 4 4 0 1 1-4-4M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4",
  },
  light: {
    label: "Light",
    icon: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4",
  },
  dark: { label: "Dark", icon: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" },
};

export function ThemeToggle() {
  const { pref, cycle } = useTheme();
  const theme = THEMES[pref] || THEMES.system;
  const description = `Appearance: ${theme.label}. Tap to change.`;

  return (
    <button
      class="theme"
      aria-label={description}
      title={description}
      onClick={cycle}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d={theme.icon}></path>
      </svg>
      {theme.label}
    </button>
  );
}
