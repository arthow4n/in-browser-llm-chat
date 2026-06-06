import "fake-indexeddb/auto";
import "@testing-library/jest-dom";
import "./test/msw-setup";

/**

 * Vitest global test setup file.
 *
 * Polyfills browser APIs that are used by Carbon Design System components
 * but are not available in the JSDOM test environment.
 */

// Polyfill ResizeObserver — required by @carbon/react internal useResizeObserver
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
