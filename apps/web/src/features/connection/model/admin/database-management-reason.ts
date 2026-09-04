import type { ConnectionCapabilities } from "@qyre/core";
import { READ_ONLY_REASON_LABEL } from "@qyre/ui";

export function databaseManagementReason(
  capabilities: ConnectionCapabilities | undefined
): string | undefined {
  if (!capabilities) return undefined;
  if (capabilities.readOnlyReason) return READ_ONLY_REASON_LABEL[capabilities.readOnlyReason];
  if (!capabilities.supportsDatabaseManagement) {
    return "Your database role doesn't have database-management privileges.";
  }
  return undefined;
}
