import type { ConnectionCapabilities } from "@qyre/core";

export const READ_ONLY_REASON_LABEL: Record<
  Exclude<ConnectionCapabilities["readOnlyReason"], null>,
  string
> = {
  "qyre-flag": "Read-only: qyre --read-only flag",
  replica: "Read-only: replica connection",
  connection: "Read-only: the connection itself is read-only",
  grants: "Read-only: your database role has no write grants"
};
