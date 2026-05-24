/**
 * =============================================================================
 * KANSHI RC INTELLIGENCE SYSTEM - DOM UTILITIES
 * =============================================================================
 *
 * File: src/ui/dom.ts
 * Execution Context: Desktop PC (Browser Environment)
 *
 * PURPOSE:
 * This module provides utility functions for DOM manipulation and element
 * querying. It offers safer, more ergonomic alternatives to native DOM APIs
 * by adding error handling and type safety.
 *
 * DESIGN PHILOSOPHY:
 * The native querySelector API returns Element | null, requiring null checks
 * throughout application code. For elements that are required for the
 * application to function, this creates unnecessary verbosity and potential
 * for runtime errors when elements are silently null.
 *
 * The utilities in this module take a "fail-fast" approach: if a required
 * element is missing, the application throws immediately with a clear error
 * message, rather than propagating null through the codebase.
 *
 * USAGE CONTEXT:
 * These utilities are used during application initialization to obtain
 * references to DOM elements. They're particularly useful for:
 *   - Video stream elements
 *   - Control button containers
 *   - Status display areas
 *   - Form inputs
 *
 * ERROR HANDLING STRATEGY:
 * Throwing on missing elements is intentional. Missing elements indicate:
 *   - HTML markup doesn't match JavaScript expectations
 *   - Deployment issues (wrong HTML file)
 *   - Development errors (typos in selectors)
 *
 * These are programming errors that should fail loudly during development
 * and testing, not silently at runtime.
 *
 * =============================================================================
 */

/**
 * QUERY REQUIRED ELEMENT
 *
 * Retrieves a DOM element by CSS selector, throwing if not found.
 *
 * This function provides a type-safe, fail-fast alternative to querySelector
 * for cases where an element must exist for the application to function.
 *
 * TYPE PARAMETER:
 * The generic parameter T allows callers to specify the expected element type,
 * eliminating the need for type assertions at call sites.
 *
 * EXAMPLES:
 *
 *   // Without type parameter (returns Element)
 *   const container = queryRequired(".video-container");
 *
 *   // With type parameter (returns HTMLImageElement)
 *   const image = queryRequired<HTMLImageElement>("#video-feed");
 *   // Now image.src is available without type assertion
 *
 *   // With custom root element
 *   const panel = queryRequired(".settings-panel");
 *   const slider = queryRequired<HTMLInputElement>(".speed-slider", panel);
 *
 * @template T - The expected DOM element type (must extend Element)
 *
 * @param selector - CSS selector string to find the element.
 *                   Supports all standard CSS selector syntax.
 *
 * @param root - Optional parent node to search within. Defaults to document.
 *               Useful for scoped queries within specific containers.
 *
 * @returns The found element, cast to type T
 *
 * @throws Error if no element matches the selector. The error message
 *         includes the selector for debugging purposes.
 *
 * PERFORMANCE:
 * This function performs a single querySelector call, which is O(1) for ID
 * selectors and O(n) for class/attribute selectors (where n is DOM size).
 * Results are not cached, so store the return value rather than querying
 * repeatedly.
 *
 * CONTRAST WITH NATIVE API:
 *
 *   // Native approach (verbose, error-prone)
 *   const image = document.querySelector("#video-feed");
 *   if (!image) {
 *     throw new Error("Video feed element not found");
 *   }
 *   (image as HTMLImageElement).src = url;
 *
 *   // With queryRequired (concise, type-safe)
 *   const image = queryRequired<HTMLImageElement>("#video-feed");
 *   image.src = url; // TypeScript knows this is HTMLImageElement
 */
export function queryRequired<T extends Element>(
  selector: string,
  root: ParentNode = document,
): T {
  /*
   * Perform the DOM query using native querySelector.
   * This returns the first matching element or null.
   */
  const element = root.querySelector(selector);

  /*
   * Fail fast if the element doesn't exist.
   * The error message includes the selector to aid debugging.
   * This is more helpful than a generic null reference error
   * later in the code.
   */
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  /*
   * Cast to the requested type and return.
   *
   * TYPE SAFETY NOTE:
   * This cast trusts the caller to provide the correct type parameter.
   * If the element exists but is the wrong type (e.g., expecting
   * HTMLImageElement but getting HTMLDivElement), the cast will
   * succeed but later property access may fail.
   *
   * For maximum safety in critical code, additional type checking
   * could be added:
   *   if (!(element instanceof HTMLImageElement)) {
   *     throw new Error(`Element ${selector} is not an HTMLImageElement`);
   *   }
   *
   * However, this is omitted for simplicity since selectors are
   * typically specific enough to ensure correct element types.
   */
  return element as T;
}
