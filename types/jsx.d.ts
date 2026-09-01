/* The classic JSX runtime (jsxFactory: "h") never establishes the ambient
   JSX link that jsxImportSource would, and preact only exposes its JSX
   namespace as preact.JSX — this re-exposes it as the global JSX the
   compiler looks for. */
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
