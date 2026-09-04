import type { ConnectionCapabilities } from "@qyre/core";

export function stubReadOnlyCapabilities(supportsSql: boolean): ConnectionCapabilities {
  return {
    supportsSql,
    rowExportFormats: supportsSql ? ["csv", "json", "sql"] : ["csv", "json"],
    jsonExportMode: supportsSql ? "json" : "extended-json",
    supportsAccessInspection: false,
    supportsRowMutations: false,
    supportsDdl: false,
    supportsIndexManagement: false,
    supportsDatabaseManagement: false,
    supportsTransactions: false,
    readOnlyReason: "grants"
  };
}
