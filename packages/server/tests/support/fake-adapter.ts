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
    classifyPermissionDenied: () => undefined,
    getOverview: async () => ({
      engine: "postgres",
      schemas: [],
      capabilities: stubReadOnlyCapabilities(true)
    }),
    getTable: async () => ({ schema: "public", name: "x", kind: "table", columns: [] }),
    getAllTables: async () => [{ schema: "public", name: "x", kind: "table", columns: [] }],
    getRows: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 }),
    streamRows: async function* () {},
    runReadOnlyQuery: async () => ({ columns: [], rows: [], page: 0, pageSize: 0 }),
    ...overrides
  };
}
