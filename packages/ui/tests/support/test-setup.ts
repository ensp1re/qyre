import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// Register cleanup explicitly because Vitest globals are disabled.
afterEach(() => {
  cleanup();
});

// jsdom reports zero layout dimensions, so virtualized lists need fixed test sizes.
Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, value: 600 });
Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: 800 });
