import type { AccessOverview } from "@qyre/core";

export interface DatabaseAdminApi {
  inspectAccess?(): Promise<AccessOverview>;
  listDatabases?(): Promise<string[]>;
  createDatabase?(name: string): Promise<void>;
  dropDatabase?(name: string): Promise<void>;
  createSchema?(name: string): Promise<void>;
  dropSchema?(name: string): Promise<void>;
}
