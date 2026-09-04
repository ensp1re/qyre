import type { ConnectionCapabilities } from "@qyre/core";

const QYRE_FLAG_CAPABILITIES: Omit<
  ConnectionCapabilities,
  "supportsSql" | "rowExportFormats" | "jsonExportMode" | "supportsAccessInspection"
> = {
  supportsRowMutations: false,
  supportsDdl: false,
  supportsIndexManagement: false,
  supportsDatabaseManagement: false,
  supportsTransactions: false,
  readOnlyReason: "qyre-flag"
};

/** Apply the session read-only ceiling while preserving engine facts. */
export function applyReadOnlyOverride(
  capabilities: ConnectionCapabilities,
  readOnly: boolean
): ConnectionCapabilities {
  if (!readOnly) return capabilities;
  return {
    supportsSql: capabilities.supportsSql,
    rowExportFormats: capabilities.rowExportFormats,
    jsonExportMode: capabilities.jsonExportMode,
    supportsAccessInspection: capabilities.supportsAccessInspection,
    ...QYRE_FLAG_CAPABILITIES
  };
}
