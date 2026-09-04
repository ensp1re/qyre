import type { ConnectionCapabilities, TablePermissions } from "@qyre/core";

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

export function tableAllows(
  permissions: TablePermissions | undefined,
  action: keyof TablePermissions
): boolean {
  return permissions?.[action] ?? false;
}
