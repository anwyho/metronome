/* An ES-module face on the inline boot script, so nothing outside the head has
   to know it is a global. The boot has already run by the time any module is
   evaluated — it is the first thing in the document. */

const boot = () => window.__theme;

export const themeOrder = () => boot()?.order ?? ["system", "light", "dark"];

/* The choice of the three — 'system', 'light' or 'dark'. */
export const themePref = () => boot()?.pref ?? "system";

/* What that choice currently means: 'light' or 'dark'. */
export const themeResolved = () => boot()?.resolved ?? "light";

export const setTheme = (pref) => boot()?.set(pref);
export const cycleTheme = () => boot()?.cycle();

export function onThemeChange(listener) {
  addEventListener("themechange", listener);
  return () => removeEventListener("themechange", listener);
}
