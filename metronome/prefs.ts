/* The handful of settings that follow the device rather than the link: volume,
   count-in, and whether a one-time hint has been seen. localStorage throws in
   private windows and under some embeddings, so every access is guarded and a
   failure means the defaults. */

/* The theme choice of the three, and the light or dark it currently means.
   The store does not own the theme — `pwa/theme.js` does — but the choice is a
   device preference like the rest of these, so its type lives here. */
export type ThemePref = "system" | "light" | "dark";
export type Resolved = "light" | "dark";

/* Everything that may be in the record. Every field is optional: the record is
   whatever an older build, or a hand-edited localStorage, left behind. */
export interface StoredPrefs {
  volume?: number;
  countIn?: number;
  installDismissed?: boolean;
  pattern?: string;
}

export interface Prefs {
  key: string;
  read(): StoredPrefs;
  save(patch: StoredPrefs): void;
}

export function createPrefs(id = "a"): Prefs {
  const key = "metro.prefs." + id;

  const read = (): StoredPrefs => {
    try {
      return JSON.parse(localStorage.getItem(key) || "{}");
    } catch {
      return {};
    }
  };

  return {
    key,
    read,
    save(patch) {
      try {
        localStorage.setItem(key, JSON.stringify({ ...read(), ...patch }));
      } catch {}
    },
  };
}
