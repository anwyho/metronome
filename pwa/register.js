/* Service worker registration, the update prompt, and the version readout.
   Loaded during parse, not on window.load, so the cache is warmed before
   subresources finish. */
(function () {
  /* The template reads this and re-renders on the 'swinfo' event. Created here
     or by the template script, whichever runs first. */
  var info =
    window.__swInfo || (window.__swInfo = { version: null, update: false });

  function set(patch) {
    for (var k in patch) info[k] = patch[k];
    dispatchEvent(new Event("swinfo"));
  }

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

  /* addEventListener alone leaves this queue disabled — only assigning
     onmessage or calling startMessages() opens it — so a content-updated
     posted while the page was still parsing was queued and never delivered,
     and the shell-diff half of update detection never fired. The version
     readout was unaffected: it answers on a MessageChannel port, which has no
     such gate. */
  if (sw.startMessages) sw.startMessages();

  function askVersion() {
    if (!sw.controller) return;
    var ch = new MessageChannel();
    ch.port1.onmessage = function (e) {
      if (e.data && e.data.type === "version")
        set({ version: e.data.version, build: e.data.build });
    };
    sw.controller.postMessage({ type: "version" }, [ch.port2]);
  }

  /* Checking is silent. Finding something only raises a flag the panel reads,
     so the offer sits beside the version it would replace. */
  function showBanner() {
    if (!info.update) set({ update: true });
  }

  window.__applyUpdate = function () {
    if (reloading) return;
    reloading = true;
    location.reload();
  };

  sw.register("sw.js", { scope: "./" })
    .then(function (reg) {
      askVersion();
      var check = function () {
        if (document.visibilityState === "visible") reg.update();
      };
      addEventListener("visibilitychange", check);
      /* Registering above is itself a check, so a reload always asks. This is
         for an installed app, which can sit open for days without one. */
      setInterval(check, 5 * 60 * 1000);
    })
    .catch(function (err) {
      console.error("[metronome] service worker registration failed:", err);
    });

  if (sw.controller) askVersion();
})();
