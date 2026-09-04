import type { DatabaseAdapter } from "@qyre/driver-contract";

export function requireAdapter(adapter: DatabaseAdapter | undefined): DatabaseAdapter {
  if (!adapter) {
    throw Object.assign(new Error("No database connection is configured."), { statusCode: 503 });
  }
  return adapter;
}
