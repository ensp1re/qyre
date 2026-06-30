import { libConfig } from "@humb/config/tsup";
import { defineConfig } from "tsup";

export default defineConfig(
  libConfig({
    entry: ["src/index.ts", "src/bin.ts"]
  })
);
