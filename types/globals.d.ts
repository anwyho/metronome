/* The theme choice of the three, and the light or dark it currently means.
   They live here rather than in metronome/prefs.ts because pwa/theme-boot.ts
   compiles in its own program, and a module import from this file would pull
   metronome/ into that program and emit it twice. `metronome/prefs.ts`
   re-exports them, so app code still reads them from where the rest of the
   device preferences live. */
export type ThemePref = "system" | "light" | "dark";
export type Resolved = "light" | "dark";

declare global {
  interface AudioSession {
    type: "playback" | "ambient" | "transient" | "transient-solo";
  }
  interface Navigator {
    readonly audioSession?: AudioSession;
  }

  interface ThemeApi {
    pref: ThemePref;
    resolved: Resolved;
    order: readonly string[];
    set(p: string): void;
    cycle(): void;
  }
  interface SwInfo {
    version: string | null;
    build?: string;
    update: boolean;
  }

  /* Dispatched at the document, but it bubbles, so a window listener sees it —
     which lib.dom's WindowEventMap does not say. */
  interface WindowEventMap {
    visibilitychange: Event;
  }

  interface Window {
    __theme: ThemeApi;
    __swInfo: SwInfo;
    __applyUpdate: () => void;
    /* Safari still ships the context only under its prefix. */
    webkitAudioContext?: typeof AudioContext;
  }
}
