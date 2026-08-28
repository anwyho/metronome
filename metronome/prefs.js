/* The handful of settings that follow the device rather than the link: volume,
   count-in, and whether a one-time hint has been seen. localStorage throws in
   private windows and under some embeddings, so every access is guarded and a
   failure means the defaults. */

export function createPrefs(id = "a") {
  const key = "metro.prefs." + id;

  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(key) || "{}");
    } catch {
      return {};
    }
  };

  return {
    key,
    read,
    save(patch) {
      try {
        localStorage.setItem(key, JSON.stringify({ ...read(), ...patch }));
      } catch {}
    },
  };
}
