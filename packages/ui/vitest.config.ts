import { testConfig } from "@humbdb/config/vitest";
import { defineConfig } from "vitest/config";

// jsdom (not the shared default "node" environment) so component tests (F055) can actually render
// and interact with real DOM nodes via @testing-library/react.
export default defineConfig(
  testConfig({ test: { environment: "jsdom", setupFiles: ["./src/test-setup.ts"] } })
);
