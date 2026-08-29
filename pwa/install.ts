/* Whether an install hint is worth showing at all. Whether it has been
   dismissed is the app's business, because that is where the rest of its
   preferences live. */

export interface InstallContext {
  standalone: boolean;
  touch: boolean;
}

export function installContext(): InstallContext {
  const query = (q: string, fallback: boolean): boolean => {
    try {
      return matchMedia(q).matches;
    } catch {
      return fallback;
    }
  };
  return {
    standalone: query("(display-mode: standalone)", false),
    /* The hint is Share-sheet instructions, which only mean anything on a touch
       device — iOS has no programmatic install to offer instead, and every
       other platform prompts for itself. */
    touch: query("(pointer: coarse)", true),
  };
}
