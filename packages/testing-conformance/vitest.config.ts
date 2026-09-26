import { testConfig } from "@qyre/config/vitest";
import { defineConfig } from "vitest/config";

export default defineConfig(
  testConfig({
    test: {
      // Fixture grants update shared Postgres database and schema catalog rows.
      fileParallelism: false
    }
  })
);
