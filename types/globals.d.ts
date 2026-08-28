export {};

declare global {
  interface AudioSession {
    type: "playback" | "ambient" | "transient" | "transient-solo";
  }
  interface Navigator {
    readonly audioSession?: AudioSession;
  }

  interface ThemeApi {
    pref: import("../metronome/prefs.js").ThemePref;
    resolved: import("../metronome/prefs.js").Resolved;
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
