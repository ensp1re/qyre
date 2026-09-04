import { libConfig } from "@qyre/config/tsup";
import { defineConfig } from "tsup";

export default defineConfig(
  libConfig({
    // Keep better-sqlite3 external so its native binding resolves from the installed package.
    external: ["better-sqlite3"]
  })
);
