/* Service worker registration, update detection, and the version readout.

   A classic script rather than a module, and loaded during parse rather than on
   load, so the worker is being checked while the rest of the page is still
   arriving. `pwa/updates.js` is the module-side read of what it finds. */
(function () {
  /* The app reads this and re-renders on the 'swinfo' event. */
  const info = (window.__swInfo = window.__swInfo || {
    version: null,
    update: false,
  });

  const set = (patch) => {
    Object.assign(info, patch);
    dispatchEvent(new Event("swinfo"));
  };

  /* Checking is silent. Finding something only raises a flag the panel reads,
     so the offer sits beside the version it would replace, and the reload is
     always the reader's press. */
  const offerUpdate = () => {
    if (!info.update) set({ update: true });
  };

  let reloading = false;
  window.__applyUpdate = () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  };

  if (!("serviceWorker" in navigator)) return;
  const sw = navigator.serviceWorker;

  /* The worker answers on a private port rather than by broadcasting, so a
     reply cannot be confused with an announcement. */
  function askVersion() {
    if (!sw.controller) return;
    const channel = new MessageChannel();
    channel.port1.onmessage = (e) => {
      if (e.data && e.data.type === "version") {
        set({ version: e.data.version, build: e.data.build });
      }
    };
    sw.controller.postMessage({ type: "version" }, [channel.port2]);
  }

  /* An uncontrolled page is a first launch: the worker installing and claiming
     fires controllerchange with nothing new anywhere. Only a change of script
     URL under an existing controller is a genuine update. */
  let hadController = !!sw.controller;
  let priorURL = sw.controller && sw.controller.scriptURL;

  sw.addEventListener("controllerchange", () => {
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
    offerUpdate();
  });

  /* The worker refetches the shell behind every launch and says so only when
     the bytes actually differ, so a deploy that changes nothing stays quiet. */
  sw.addEventListener("message", (e) => {
    if (!e.data) return;
    if (e.data.type === "content-updated") offerUpdate();
    if (e.data.type === "version") {
      set({ version: e.data.version, build: e.data.build });
    }
  });

  /* addEventListener alone leaves this queue shut — only assigning onmessage
     or calling startMessages() opens it — so a content-updated posted while the
     page was still parsing would be queued and never delivered. The version
     readout is unaffected: a MessageChannel port has no such gate. */
  if (sw.startMessages) sw.startMessages();

  sw.register("sw.js", { scope: "./" })
    .then((registration) => {
      askVersion();
      const check = () => {
        if (document.visibilityState === "visible") registration.update();
      };
      addEventListener("visibilitychange", check);
      /* Registering is itself a check, so a reload always asks. This is for an
         installed app, which can sit open for days without one. */
      setInterval(check, 5 * 60 * 1000);
    })
    .catch((err) => {
      console.error("service worker registration failed:", err);
    });

  if (sw.controller) askVersion();
})();
