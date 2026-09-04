import { libConfig } from "@qyre/config/tsup";
import { defineConfig } from "tsup";

export default defineConfig(
  libConfig({
    // tsup externalizes `dependencies` automatically but not `optionalDependencies`, and
    // better-sqlite3 moved there so a failed native build cannot abort `npm i qyre` for people who
    // only use Postgres/MySQL/MongoDB. Left implicit, esbuild inlined better-sqlite3's own JS into
    // the bundle, which broke its binding lookup: `lib/binding.js` resolves the .node file from its
    // own `__dirname`, so once bundled it searched this package's dist directory instead of its own
    // and threw "Cannot find module .../packages/drivers/sqlite/build/Release/better_sqlite3.node".
    external: ["better-sqlite3"]
  })
);
