/* An ES-module face on the inline boot script, so nothing outside the head has
   to know it is a global. The boot has already run by the time any module is
   evaluated — it is the first thing in the document. */

const boot = () => window.__theme;

/* The choice of the three — 'system', 'light' or 'dark'. `window.__theme` also
   carries `resolved`, `order` and `set` for a consumer that needs them. */
export const themePref = () => boot()?.pref ?? "system";

export const cycleTheme = () => boot()?.cycle();

export function onThemeChange(listener) {
  addEventListener("themechange", listener);
  return () => removeEventListener("themechange", listener);
}
