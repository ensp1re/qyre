import type { DatabaseAdapter } from "@qyre/driver-contract";
import { stubReadOnlyCapabilities } from "@qyre/driver-contract";

/** A minimal, fully-functional fake adapter for route tests that don't hit a real database. */
export function makeFakeAdapter(overrides: Partial<DatabaseAdapter> = {}): DatabaseAdapter {
  return {
    engine: "postgres",
    connect: async () => {},
    disconnect: async () => {},
    ping: async () => true,
    getVersion: async () => "PostgreSQL 16.0",
    getCapabilities: async () => stubReadOnlyCapabilities(true),
    getOverview: async () => ({
      engine: "postgres",
      schemas: [],
      capabilities: stubReadOnlyCapabilities(true)
    }),
    getTable: async () => ({ schema: "public", name: "x", columns: [] }),
    getRows: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 }),
    runReadOnlyQuery: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 }),
    ...overrides
  };
}
