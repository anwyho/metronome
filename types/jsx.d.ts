import type { JSX as PreactJSX } from "preact";

declare global {
  namespace JSX {
    interface Element extends PreactJSX.Element {}
    interface IntrinsicElements extends PreactJSX.IntrinsicElements {}
    interface IntrinsicAttributes extends PreactJSX.IntrinsicAttributes {}
    interface ElementChildrenAttribute
      extends PreactJSX.ElementChildrenAttribute {}
  }
}

export {};
