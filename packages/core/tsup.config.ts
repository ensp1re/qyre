import { libConfig } from "@qyre/config/tsup";
import { defineConfig } from "tsup";

export default defineConfig(libConfig({ entry: ["src/index.ts", "src/filter-capabilities.ts"] }));
