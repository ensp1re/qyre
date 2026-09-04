import { cpSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { libConfig } from "@qyre/config/tsup";
import { defineConfig } from "tsup";

const here = dirname(fileURLToPath(import.meta.url));
const webDist = resolve(here, "../../apps/web/dist");
const bundledWebDir = resolve(here, "dist/web");

export default defineConfig(
  libConfig({
    entry: ["src/index.ts", "src/bin.ts"],
    // Include the web build in published CLI packages when it exists.
    onSuccess: async () => {
      if (existsSync(webDist)) {
        cpSync(webDist, bundledWebDir, { recursive: true });
      }
    }
  })
);
