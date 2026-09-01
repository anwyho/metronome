import { useEffect, useState } from "../../vendor/hooks.module.js";
import type { State, Store } from "../../metronome/store.js";

/* The store replaces its state object on every change, so subscribing is all
   the re-render trigger this needs. */
export function useStore(store: Store): State {
  const [state, setState] = useState(store.state);
  useEffect(() => {
    setState(store.state);
    return store.subscribe(setState);
  }, [store]);
  return state;
}
