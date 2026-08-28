import { useEffect, useState } from "../../vendor/hooks.module.js";

/* The choice is resolved and stamped on <html> by an inline script in the head,
   ahead of first paint. This only reads what that decided and offers the way to
   change it. */
export function useTheme() {
  const [pref, setPref] = useState(() => window.__theme?.pref ?? "system");
  useEffect(() => {
    const sync = () => setPref(window.__theme?.pref ?? "system");
    addEventListener("themechange", sync);
    sync();
    return () => removeEventListener("themechange", sync);
  }, []);
  return { pref, cycle: () => window.__theme?.cycle() };
}
