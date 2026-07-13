import type { ConnectionCapabilities } from "@qyre/core";

/**
 * Every `supports*` write flag hardcoded false with `readOnlyReason: "grants"` - the interim
 * `getCapabilities()` implementation every adapter uses until its own permission-introspection
 * slice (F092 Postgres, F093 MySQL, F094 SQLite, F095 MongoDB) replaces it with a real,
 * grants-driven value. `"grants"` is a placeholder here, not a claim that the connected role was
 * actually checked and found wanting - it's the same conservative default
 * docs/product-specs/permissions-and-capabilities.md prescribes for introspection that hasn't run
 * yet, reusing the same fallback used when introspection fails outright.
 */
export function stubReadOnlyCapabilities(supportsSql: boolean): ConnectionCapabilities {
  return {
    supportsSql,
    rowExportFormats: supportsSql ? ["csv", "json", "sql"] : ["csv", "json"],
    jsonExportMode: supportsSql ? "json" : "extended-json",
    supportsRowMutations: false,
    supportsDdl: false,
    supportsIndexManagement: false,
    supportsDatabaseManagement: false,
    supportsTransactions: false,
    readOnlyReason: "grants"
  };
}
