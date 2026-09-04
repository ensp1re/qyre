import { testConfig } from "@qyre/config/vitest";
import { defineConfig } from "vitest/config";

// Component tests require jsdom to render real DOM nodes.
export default defineConfig(
  testConfig({ test: { environment: "jsdom", setupFiles: ["./tests/support/test-setup.ts"] } })
);
