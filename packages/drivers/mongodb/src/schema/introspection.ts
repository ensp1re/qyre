import type {
  ColumnMetadata,
  IndexMetadata,
  SchemaMetadata,
  TableKind,
  TableMetadata
} from "@qyre/core";
import type { Collection, MongoClient } from "mongodb";
import { classifyMongodbPermissionDenied } from "../access/permission-errors.js";
import { inferColumns } from "../runtime/bson-values.js";
import { isSystemCollection, SYSTEM_DATABASES } from "./catalog.js";

const FIELD_SAMPLE_SIZE = 100;

/** MongoDB's own default index on `_id`, present on every collection - reported the same way a
 * SQL engine's primary-key index is (F112). A view has no indexes of its own. */
async function fetchIndexes(collection: Collection): Promise<IndexMetadata[]> {
  const indexes = await collection.indexes();
  return indexes.map((index) => ({
    name: index.name as string,
    columns: Object.keys(index.key as Record<string, unknown>),
    unique: index.unique === true,
    primary: index.name === "_id_"
  }));
}

/** Enumerate visible database names. Cluster-wide `listDatabases` needs a privilege that
 * URL-scoped roles (common on Atlas) often lack; a code-13 denial falls back to the database
 * named in the connection URL so a single-database user still gets a working explorer. */
async function listVisibleDatabases(client: MongoClient): Promise<string[]> {
  try {
    const { databases } = await client.db().admin().listDatabases({ nameOnly: true });
    return databases.map(({ name }) => name);
  } catch (error) {
    if (classifyMongodbPermissionDenied(error) === undefined) throw error;
    return [client.db().databaseName];
  }
}

/** List user databases and collections in Qyre's schema shape. */
export async function introspectSchemas(client: MongoClient): Promise<SchemaMetadata[]> {
  const schemas: SchemaMetadata[] = [];
  for (const name of await listVisibleDatabases(client)) {
    if (SYSTEM_DATABASES.has(name)) continue;
    const collections = await client
      .db(name)
      .listCollections(undefined, { nameOnly: true })
      .toArray();
    schemas.push({
      name,
      tables: collections
        .map((collection) => collection.name)
        .filter((collectionName) => !isSystemCollection(collectionName))
    });
  }
  return schemas;
}

/** Introspect one collection/view using a bounded document sample. */
export async function introspectCollection(
  client: MongoClient,
  schema: string,
  table: string,
  statementTimeoutMs: number
): Promise<TableMetadata> {
  const db = client.db(schema);
  const collection = db.collection(table);
  const [info] = await db.listCollections({ name: table }, { nameOnly: true }).toArray();
  const kind: TableKind = info?.type === "view" ? "view" : "collection";
  const sample = await collection
    .aggregate([{ $sample: { size: FIELD_SAMPLE_SIZE } }], { maxTimeMS: statementTimeoutMs })
    .toArray();
  const columns: ColumnMetadata[] = [
    {
      name: "_id",
      dataType: "objectId",
      nullable: false,
      isPrimaryKey: true,
      isForeignKey: false
    },
    ...inferColumns(sample).filter((column) => column.name !== "_id")
  ];
  const rowCount = kind === "view" ? undefined : await collection.estimatedDocumentCount();
  const indexes = kind === "view" ? [] : await fetchIndexes(collection);
  return { schema, name: table, kind, columns, indexes, rowCount };
}
