import type { ConnectionCapabilities } from "@qyre/core";

/** Mirrors docs/product-specs/permissions-and-capabilities.md's example badge copy exactly for
 * "qyre-flag"/"replica"/"grants"; "connection" has no example there, phrased consistently.
 * Shared beyond `StatusBar`'s own badge (F097) - the SQL Editor (F108) reuses the exact same copy
 * to explain a read-only session's rejected write attempt. */
export const READ_ONLY_REASON_LABEL: Record<
  Exclude<ConnectionCapabilities["readOnlyReason"], null>,
  string
> = {
  "qyre-flag": "Read-only: qyre --read-only flag",
  replica: "Read-only: replica connection",
  connection: "Read-only: the connection itself is read-only",
  grants: "Read-only: your database role has no write grants"
};
