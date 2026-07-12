import type { ConnectionCapabilities, TablePermissions } from "@qyre/core";

/**
 * Session-level write-affordance gate (F097): every later write surface (row editing, SQL
 * execution, DDL, admin) checks the matching `supports*` flag through this helper before rendering
 * a control, rather than reading `capabilities` ad hoc - a single place to change if the gating
 * rule ever needs to (e.g. a future engine-specific carve-out). Missing/loading capabilities gate
 * closed (`false`), matching the advisory-introspection principle: never assume writable.
 */
export function sessionAllows(
  capabilities: ConnectionCapabilities | undefined,
  capability: keyof Pick<
    ConnectionCapabilities,
    | "supportsRowMutations"
    | "supportsDdl"
    | "supportsIndexManagement"
    | "supportsDatabaseManagement"
    | "supportsTransactions"
  >
): boolean {
  return capabilities?.[capability] ?? false;
}

/**
 * Per-table write-affordance gate (F097) - the second, independent tier `TablePermissions` adds on
 * top of {@link sessionAllows}: "the two tiers narrow independently; neither alone is sufficient to
 * show a control" (docs/product-specs/permissions-and-capabilities.md). A row-level control (e.g. a
 * per-row delete button) must pass both checks.
 */
export function tableAllows(
  permissions: TablePermissions | undefined,
  action: keyof TablePermissions
): boolean {
  return permissions?.[action] ?? false;
}
