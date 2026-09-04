import { libConfig } from "@qyre/config/tsup";
import { defineConfig } from "tsup";

export default defineConfig(
  libConfig({
    entry: [
      "src/index.ts",
      "src/constants/connection.ts",
      "src/filter-capabilities.ts",
      "src/mutation/editor-capabilities.ts",
      "src/mutation/editor-values.ts",
      "src/csv-import.ts"
    ]
  })
);
