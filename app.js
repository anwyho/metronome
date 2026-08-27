/* Service worker registration, the update prompt, and the version readout.
   Loaded during parse, not on window.load, so the cache is warmed before
   subresources finish. */
(function () {
  /* The template reads this and re-renders on the 'swinfo' event. Created here
     or by the template script, whichever runs first. */
  var info =
    window.__swInfo || (window.__swInfo = { version: null, state: "idle" });

  function set(patch) {
    for (var k in patch) info[k] = patch[k];
    dispatchEvent(new Event("swinfo"));
  }

  if (!("serviceWorker" in navigator)) {
    window.__checkForUpdates = function () {};
    return;
  }

  var sw = navigator.serviceWorker;
  var registration = null;
  var revert = null;

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
      askVersion();
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
    if (!e.data) return;
    if (e.data.type === "content-updated") showBanner();
    if (e.data.type === "version")
      set({ version: e.data.version, build: e.data.build });
  });

  function askVersion() {
    if (!sw.controller) return;
    var ch = new MessageChannel();
    ch.port1.onmessage = function (e) {
      if (e.data && e.data.type === "version")
        set({ version: e.data.version, build: e.data.build });
    };
    sw.controller.postMessage({ type: "version" }, [ch.port2]);
  }

  function showBanner() {
    set({ state: "update" });
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

  /* A manual check exists because the automatic ones are invisible: after a
     deploy you want to know whether this device has it, not wait an hour. */
  window.__checkForUpdates = function () {
    if (!registration || info.state === "checking") return;
    clearTimeout(revert);
    set({ state: "checking" });
    registration
      .update()
      .then(function () {
        if (registration.installing || registration.waiting) return; // banner will follow
        set({ state: "current" });
        revert = setTimeout(function () {
          set({ state: "idle" });
        }, 3000);
      })
      .catch(function () {
        set({ state: "idle" });
      });
  };

  sw.register("sw.js", { scope: "./" })
    .then(function (reg) {
      registration = reg;
      askVersion();
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

  if (sw.controller) askVersion();
})();
