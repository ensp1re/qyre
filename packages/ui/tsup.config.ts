import { libConfig } from "@humbdb/config/tsup";
import { defineConfig } from "tsup";

export default defineConfig(
  libConfig({
    entry: ["src/index.tsx"],
    external: ["react", "react-dom", "react/jsx-runtime"]
  })
);
