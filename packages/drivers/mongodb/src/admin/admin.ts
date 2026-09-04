import type { MongoClient } from "mongodb";
import { SYSTEM_DATABASES } from "../schema/catalog.js";

export async function listDatabases(client: MongoClient): Promise<string[]> {
  const result = await client.db().admin().listDatabases({ nameOnly: true });
  return result.databases
    .map((database) => database.name)
    .filter((name) => !SYSTEM_DATABASES.has(name))
    .sort();
}

export async function dropDatabase(client: MongoClient, name: string): Promise<void> {
  await client.db(name).dropDatabase();
}
