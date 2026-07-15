import type { MongoClient } from "mongodb";
import { SYSTEM_DATABASES } from "../schema/catalog.js";

/**
 * Database-lifecycle operations (F115), per docs/product-specs/schema-editing.md's "Database and
 * schema lifecycle" section. MongoDB has no `createDatabase` member at all - databases come into
 * existence implicitly on the first write into them (e.g. `createCollection`), so there is no
 * create operation to model; the route responds 400 explaining that, the same absent-member
 * pattern `commitBatch` already uses there.
 */
export async function listDatabases(client: MongoClient): Promise<string[]> {
  const result = await client.db().admin().listDatabases({ nameOnly: true });
  return result.databases
    .map((database) => database.name)
    .filter((name) => !SYSTEM_DATABASES.has(name))
    .sort();
}

/** Like MySQL, MongoDB allows dropping the currently connected database - the route's typed
 * confirmation is the deliberate-action gate, per the spec; no extra guard here. */
export async function dropDatabase(client: MongoClient, name: string): Promise<void> {
  await client.db(name).dropDatabase();
}
