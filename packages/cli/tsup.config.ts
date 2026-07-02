import { cpSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { libConfig } from "@humbdb/config/tsup";
import { defineConfig } from "tsup";

const here = dirname(fileURLToPath(import.meta.url));
const webDist = resolve(here, "../../apps/web/dist");
const bundledWebDir = resolve(here, "dist/web");

export default defineConfig(
  libConfig({
    entry: ["src/index.ts", "src/bin.ts"],
    // Bundles apps/web's build into dist/web so the published npm package can serve the UI
    // standalone (F010) - see src/index.ts's defaultWebRoot() for how this is found at runtime.
    // No-ops if apps/web hasn't been built yet (e.g. a package-only `tsup` re-run).
    onSuccess: async () => {
      if (existsSync(webDist)) {
        cpSync(webDist, bundledWebDir, { recursive: true });
      }
    }
  })
);
