/* Resolves the theme and stamps <html> before first paint, so a dark launch
   never flashes cream.

   This file is the source of a snippet that has to be INLINE in the head — a
   <script src> would be a network round trip ahead of the paint on a cold
   load. `tools/inline.mjs` compiles this file and injects the result into
   index.html's `<script data-theme-boot>` placeholder; it is never shipped as
   its own file.

   `pref` is the choice of the three; `resolved` is the light or dark it
   currently means. The OS query lives here rather than in the stylesheet so
   that CSS only ever sees a settled [data-theme], and so 'system' can follow
   the OS live. */
(function () {
  var KEY = "metro.theme";
  var GROUND: Record<ThemeApi["resolved"], string> = {
    light: "#f5ead8",
    dark: "#1a1714",
  };
  var ORDER: ThemeApi["pref"][] = ["system", "light", "dark"];
  var mq = matchMedia("(prefers-color-scheme: dark)");
  var pref: ThemeApi["pref"] = "system";
  try {
    pref = localStorage.getItem(KEY) as ThemeApi["pref"];
  } catch (e) {}
  if (ORDER.indexOf(pref) < 1) pref = "system";

  function apply() {
    var resolved: ThemeApi["resolved"] =
      pref === "system" ? (mq.matches ? "dark" : "light") : pref;
    document.documentElement.setAttribute("data-theme", resolved);
    var meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (meta) meta.content = GROUND[resolved];
    api.pref = pref;
    api.resolved = resolved;
    dispatchEvent(new Event("themechange"));
  }

  var api: ThemeApi = (window.__theme = {
    pref: pref,
    resolved: "light",
    order: ORDER,
    set: function (p: string) {
      pref =
        ORDER.indexOf(p as ThemeApi["pref"]) < 0
          ? "system"
          : (p as ThemeApi["pref"]);
      try {
        if (pref === "system") localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, pref);
      } catch (e) {}
      apply();
    },
    cycle: function () {
      api.set(ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]!);
    },
  });

  /* An explicit Light or Dark outranks the OS; only 'system' tracks it. */
  mq.addEventListener("change", function () {
    if (pref === "system") apply();
  });
  apply();
})();
