import type { ConnectionCapabilities } from "@qyre/core";

const QYRE_FLAG_CAPABILITIES: Omit<ConnectionCapabilities, "supportsSql"> = {
  supportsRowMutations: false,
  supportsDdl: false,
  supportsIndexManagement: false,
  supportsDatabaseManagement: false,
  supportsTransactions: false,
  readOnlyReason: "qyre-flag"
};

/**
 * `--read-only` (F096) is a hard, Qyre-level ceiling that always wins over whatever the connected
 * database role would otherwise report - applied after `getOverview()` resolves rather than
 * skipping each adapter's own introspection query outright (the product spec's ideal, but one that
 * would need every adapter's `getOverview()`/`getCapabilities()` reshaped to accept a bypass flag;
 * a local-only tool's marginal query cost doesn't justify that here). `supportsSql` is untouched -
 * it's the engine's own SQL-capability fact, unaffected by session read-only mode.
 */
export function applyReadOnlyOverride(
  capabilities: ConnectionCapabilities,
  readOnly: boolean
): ConnectionCapabilities {
  if (!readOnly) return capabilities;
  return { supportsSql: capabilities.supportsSql, ...QYRE_FLAG_CAPABILITIES };
}
