/* Service worker registration and the update prompt. Loaded during parse, not
   on window.load, so the cache is warmed before subresources finish. */
(function () {
  if (!("serviceWorker" in navigator)) return;

  var sw = navigator.serviceWorker;

  /* An uncontrolled page is a first launch: the worker installing and claiming
     fires controllerchange with nothing new anywhere. Only a change of script
     URL under an existing controller is a genuine update. */
  var hadController = !!sw.controller;
  var priorURL = sw.controller && sw.controller.scriptURL;
  var reloading = false;

  sw.addEventListener("controllerchange", function () {
    if (!hadController) {
      hadController = true;
      priorURL = sw.controller && sw.controller.scriptURL;
      return;
    }
    if (sw.controller && sw.controller.scriptURL !== priorURL) {
      priorURL = sw.controller.scriptURL;
      return;
    }
    showBanner();
  });

  /* The worker refetches index.html behind every launch and says so only when
     the bytes actually differ, so a deploy that changes nothing stays quiet. */
  sw.addEventListener("message", function (e) {
    if (e.data && e.data.type === "content-updated") showBanner();
  });

  function showBanner() {
    var el = document.getElementById("update-banner");
    if (!el || el.hasAttribute("data-show")) return;
    el.setAttribute("data-show", "");
    document
      .getElementById("update-reload")
      .addEventListener("click", function () {
        if (reloading) return;
        reloading = true;
        location.reload();
      });
  }

  sw.register("sw.js", { scope: "./" })
    .then(function (reg) {
      var check = function () {
        if (document.visibilityState === "visible") reg.update();
      };
      addEventListener("visibilitychange", check);
      /* an installed app can sit open for days without a navigation */
      setInterval(check, 60 * 60 * 1000);
    })
    .catch(function (err) {
      console.error("[metronome] service worker registration failed:", err);
    });
})();
