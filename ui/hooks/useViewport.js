import { useEffect, useState } from "../../vendor/hooks.module.js";

const read = (el) => {
  const rect = el && el.getBoundingClientRect();
  return {
    vw: rect && rect.width ? rect.width : window.innerWidth,
    vh: rect && rect.height ? rect.height : window.innerHeight,
  };
};

/* Measures the shell rather than the window: on iOS the toolbars come and go
   under a window that reports the same height, and the grid's reserve is
   calculated against what the app actually has. */
export function useViewport(ref) {
  const [size, setSize] = useState(() => read(null));

  useEffect(() => {
    const measure = () =>
      setSize((prev) => {
        const next = read(ref.current);
        const moved =
          Math.abs(next.vw - prev.vw) > 1 || Math.abs(next.vh - prev.vh) > 1;
        return moved ? next : prev;
      });

    measure();
    addEventListener("resize", measure);
    const observer = window.ResizeObserver && new ResizeObserver(measure);
    if (observer && ref.current) observer.observe(ref.current);
    return () => {
      removeEventListener("resize", measure);
      if (observer) observer.disconnect();
    };
  }, [ref]);

  return size;
}
