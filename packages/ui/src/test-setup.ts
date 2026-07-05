import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// @testing-library/react's auto-cleanup only registers itself against a globally-injected
// `afterEach` (vitest's `test.globals` option, which this repo doesn't enable) - without this,
// each render() left its DOM tree mounted for the next test in the same file, causing "multiple
// elements found" failures from stale nodes.
afterEach(() => {
  cleanup();
});

// jsdom does no real layout, so every element's offsetWidth/offsetHeight (what
// @tanstack/react-virtual - F051, used by RowsTable/QueryRunner's result table - actually reads to
// measure its scroll container, per virtual-core's getRect()) is 0 by default. With a genuinely
// zero-height container the virtualizer computes an empty visible range and renders no rows at all.
// A fixed non-zero size is the standard workaround for testing virtualized lists under jsdom (there
// is no real viewport to measure either way).
Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, value: 600 });
Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: 800 });
