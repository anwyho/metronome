import { useEffect, useState } from "../../vendor/hooks.module.js";
import { cycleTheme, onThemeChange, themePref } from "../../pwa/theme.js";

/* The choice is resolved and stamped on <html> by an inline script in the head,
   ahead of first paint. This only reads what that decided, and offers the way
   to change it. */
export function useTheme() {
  const [pref, setPref] = useState(themePref);
  useEffect(() => {
    const sync = () => setPref(themePref());
    sync();
    return onThemeChange(sync);
  }, []);
  return { pref, cycle: cycleTheme };
}
