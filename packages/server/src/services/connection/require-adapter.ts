import type { DatabaseAdapter } from "@qyre/driver-contract";

/** Throws a 503-shaped error (caught by the global error handler) when no adapter is connected. */
export function requireAdapter(adapter: DatabaseAdapter | undefined): DatabaseAdapter {
  if (!adapter) {
    throw Object.assign(new Error("No database connection is configured."), { statusCode: 503 });
  }
  return adapter;
}
