import { useEffect, useState } from "../../vendor/hooks.module.js";

/* The store replaces its state object on every change, so subscribing is all
   the re-render trigger this needs. */
export function useStore(store) {
  const [state, setState] = useState(store.state);
  useEffect(() => {
    setState(store.state);
    return store.subscribe(setState);
  }, [store]);
  return state;
}
