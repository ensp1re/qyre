import type { ConnectionCapabilities } from "@qyre/core";
import { READ_ONLY_REASON_LABEL } from "@qyre/ui";

/** Why the connection switcher's create/drop-database (and the sidebar's create/drop-schema)
 * controls are hidden (F116) - reuses `READ_ONLY_REASON_LABEL` (F097/F108's shared copy) when the
 * whole session is read-only, but falls back to a database-management-specific reason when the
 * session has SOME write capability (readOnlyReason is null) just not this one - e.g. a role with
 * row-mutation grants but no CREATEDB/superuser privilege. */
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
