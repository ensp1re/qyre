import type { MongoClient } from "mongodb";
import { describe, expect, it } from "vitest";
import { introspectSchemas } from "../src/schema/introspection.js";

/** Minimal MongoClient stand-in: `db()` with no name is the URL-scoped database. Records the
 * options every `listCollections` call receives so tests can assert the authorization flags. */
function stubClient(options: {
  listDatabasesError?: unknown;
  databases?: string[];
  urlDatabase: string;
  collectionsByDb: Record<string, string[]>;
}): { client: MongoClient; listCollectionsOptions: unknown[] } {
  const listCollectionsOptions: unknown[] = [];
  const db = (name?: string) => {
    const databaseName = name ?? options.urlDatabase;
    return {
      databaseName,
      admin: () => ({
        listDatabases: async () => {
          if (options.listDatabasesError) throw options.listDatabasesError;
          return { databases: (options.databases ?? []).map((dbName) => ({ name: dbName })) };
        }
      }),
      listCollections: (_filter?: unknown, callOptions?: unknown) => {
        listCollectionsOptions.push(callOptions);
        return {
          toArray: async () =>
            (options.collectionsByDb[databaseName] ?? []).map((collection) => ({
              name: collection
            }))
        };
      }
    };
  };
  return { client: { db } as unknown as MongoClient, listCollectionsOptions };
}

describe("introspectSchemas", () => {
  it("enumerates every non-system database when listDatabases is permitted", async () => {
    const { client } = stubClient({
      databases: ["app", "admin", "local", "config", "analytics"],
      urlDatabase: "app",
      collectionsByDb: { app: ["users"], analytics: ["events"] }
    });
    expect(await introspectSchemas(client)).toEqual([
      { name: "app", tables: ["users"] },
      { name: "analytics", tables: ["events"] }
    ]);
  });

  it("falls back to the URL-scoped database when listDatabases is unauthorized", async () => {
    const { client } = stubClient({
      listDatabasesError: { code: 13, codeName: "Unauthorized" },
      urlDatabase: "data",
      collectionsByDb: { data: ["orders", "customers"] }
    });
    expect(await introspectSchemas(client)).toEqual([
      { name: "data", tables: ["orders", "customers"] }
    ]);
  });

  it("rethrows a listDatabases failure that is not a permission denial", async () => {
    const { client } = stubClient({
      listDatabasesError: new Error("network reset"),
      urlDatabase: "data",
      collectionsByDb: {}
    });
    await expect(introspectSchemas(client)).rejects.toThrow("network reset");
  });

  it("requests only authorized collections so collection-scoped roles can list their own", async () => {
    const { client, listCollectionsOptions } = stubClient({
      listDatabasesError: { code: 13, codeName: "Unauthorized" },
      urlDatabase: "data",
      collectionsByDb: { data: ["orders"] }
    });
    await introspectSchemas(client);
    expect(listCollectionsOptions).toEqual([{ nameOnly: true, authorizedCollections: true }]);
  });
});
