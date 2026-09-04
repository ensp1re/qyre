import { FIXTURE, requireTestMongoUrl } from "@qyre/testing";
import { setupMongoFixture } from "@qyre/testing/mongodb";
import { EJSON } from "bson";
import { Binary, BSONRegExp, Code, Long, MaxKey, MinKey, MongoClient, Timestamp } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isMongoCancelError, registerMongoCancellation } from "../../src/runtime/cancellation.js";
import { MongodbAdapter, normalizeBsonValue } from "../../src/index.js";

describe("MongodbAdapter integration", () => {
  let adapter: MongodbAdapter;
  let mongoUrl: string;
  let databaseName: string;

  beforeAll(async () => {
    mongoUrl = requireTestMongoUrl();
    databaseName = new URL(mongoUrl).pathname.slice(1) || "qyre_test";
    await setupMongoFixture(mongoUrl);
    adapter = new MongodbAdapter({ engine: "mongodb", raw: mongoUrl });
    await adapter.connect();
  });

  afterAll(async () => {
    await adapter?.disconnect();
  });

  it("pings successfully", async () => {
    expect(await adapter.ping()).toBe(true);
  });

  it("reports the connected engine's name and version", async () => {
    expect(await adapter.getVersion()).toMatch(/^MongoDB \d/);
  });

  it("lists the fixture database and collection in the overview", async () => {
    const overview = await adapter.getOverview();
    const schema = overview.schemas.find((candidate) => candidate.name === databaseName);
    expect(schema?.tables).toContain(FIXTURE.table);
  });

  it("does not list system databases", async () => {
    const overview = await adapter.getOverview();
    expect(overview.schemas.map((schema) => schema.name)).not.toEqual(
      expect.arrayContaining(["admin", "local", "config"])
    );
  });

  it("introspects best-effort fields (including a nested one), flags _id as the primary key, and reports the default _id index (F112)", async () => {
    const table = await adapter.getTable(databaseName, FIXTURE.table);

    expect(table.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["_id", "name", "email", "profile"])
    );
    const idColumn = table.columns.find((column) => column.name === "_id");
    expect(idColumn?.isPrimaryKey).toBe(true);
    expect(idColumn?.isForeignKey).toBe(false);

    expect(table.indexes).toEqual([
      { name: "_id_", columns: ["_id"], unique: false, primary: true }
    ]);
    expect(table.rowCount).toBe(FIXTURE.rowCount);
  });

  it("infers per-field BSON type and nullability instead of a blanket any/nullable (F068)", async () => {
    const table = await adapter.getTable(databaseName, FIXTURE.table);
    const column = (name: string) => table.columns.find((c) => c.name === name);

    expect(column("_id")).toMatchObject({ dataType: "objectId", nullable: false });
    expect(column("name")).toMatchObject({ dataType: "string", nullable: false });
    expect(column("email")).toMatchObject({ dataType: "string", nullable: false });
    expect(column("profile")).toMatchObject({ dataType: "object", nullable: true });
  });

  it("returns MongoDB _id values as stable hexadecimal row keys", async () => {
    const page = await adapter.getRows(databaseName, FIXTURE.table, 0, 10);
    expect(page.rows).toHaveLength(FIXTURE.rowCount);
    expect(page.columns).toEqual(expect.arrayContaining(["_id", "name", "email"]));
    for (const row of page.rows) {
      expect(row._id).toMatch(/^[0-9a-f]{24}$/);
    }
  });

  it("pages deterministically with no duplicate or skipped documents (F026 regression)", async () => {
    const seenIds = new Set<string>();
    for (let page = 0; page < FIXTURE.rowCount; page++) {
      const result = await adapter.getRows(databaseName, FIXTURE.table, page, 1);
      expect(result.rows).toHaveLength(1);
      seenIds.add(String(result.rows[0]?._id));
    }
    expect(seenIds.size).toBe(FIXTURE.rowCount);

    const first = await adapter.getRows(databaseName, FIXTURE.table, 1, 1);
    const second = await adapter.getRows(databaseName, FIXTURE.table, 1, 1);
    expect(String(first.rows[0]?._id)).toBe(String(second.rows[0]?._id));
  });

  it("renders a nested document field via the structured-cell-value shape (F016 dependency)", async () => {
    const page = await adapter.getRows(databaseName, FIXTURE.table, 0, 10);
    const ada = page.rows.find((row) => row.name === "Ada Lovelace");
    expect(ada?.profile).toEqual({ account: { tags: ["admin", "beta"] } });
  });

  it("filters nested object and array values with ordinary text", async () => {
    const page = await adapter.getRows(databaseName, FIXTURE.table, 0, 10, undefined, [
      {
        column: "profile",
        op: "contains",
        value: "admin",
        columnDataType: "object"
      }
    ]);
    expect(page.rows.map((row) => row.name)).toEqual(["Ada Lovelace"]);
  });

  it("normalizes BSON types that don't serialize usefully over JSON to plain values", async () => {
    const client = new MongoClient(mongoUrl);
    try {
      await client.connect();
      const collection = client.db(databaseName).collection(FIXTURE.table);
      await collection.updateOne(
        { name: "Ada Lovelace" },
        {
          $set: {
            bigNumber: Long.fromString("9007199254740993"),
            binaryValue: new Binary(Buffer.from("hello")),
            smallNumber: Long.fromNumber(42)
          }
        }
      );

      const page = await adapter.getRows(databaseName, FIXTURE.table, 0, 10);
      const ada = page.rows.find((row) => row.name === "Ada Lovelace");
      expect(ada?.bigNumber).toBe("9007199254740993");
      expect(ada?.binaryValue).toEqual({ type: "Buffer", data: [...Buffer.from("hello")] });
      expect(ada?.smallNumber).toBe(42);
    } finally {
      await client.close();
    }
  });

  it("reports full writability for the unauthenticated fixture connection (F095)", async () => {
    // The integration fixture runs without MongoDB authorization enabled.
    await expect(adapter.getCapabilities()).resolves.toEqual({
      supportsSql: false,
      rowExportFormats: ["csv", "json"],
      jsonExportMode: "extended-json",
      supportsAccessInspection: true,
      supportsRowMutations: true,
      supportsDdl: true,
      supportsIndexManagement: true,
      supportsDatabaseManagement: true,
      supportsTransactions: false,
      readOnlyReason: null
    });

    await expect(adapter.getTable(databaseName, FIXTURE.table)).resolves.toMatchObject({
      permissions: { select: true, insert: true, update: true, delete: true }
    });

    const tables = await adapter.getAllTables();
    expect(tables.find((table) => table.name === FIXTURE.table)?.permissions).toEqual({
      select: true,
      insert: true,
      update: true,
      delete: true
    });
  });

  it("inserts a document, deserializing relaxed Extended JSON wrapper fields to real BSON (F099)", async () => {
    const result = await adapter.mutations.insertRow?.(databaseName, FIXTURE.table, {
      name: "Insert Test",
      email: "insert-test@example.com",
      joinedAt: { $date: "2024-01-01T00:00:00.000Z" }
    });
    expect(result?.row).toMatchObject({ name: "Insert Test", email: "insert-test@example.com" });
    expect(result?.row?._id).toBeDefined();

    const client = new MongoClient(mongoUrl);
    try {
      await client.connect();
      const inserted = await client
        .db(databaseName)
        .collection(FIXTURE.table)
        .findOne({ email: "insert-test@example.com" });
      expect(inserted?.joinedAt).toBeInstanceOf(Date);
    } finally {
      await client
        .db(databaseName)
        .collection(FIXTURE.table)
        .deleteOne({ email: "insert-test@example.com" });
      await client.close();
    }
  });

  it("rejects an insert into a view - MongoDB refuses writes to view namespaces natively (F099)", async () => {
    const client = new MongoClient(mongoUrl);
    const viewName = "qyre_test_insert_view";
    try {
      await client.connect();
      const db = client.db(databaseName);
      await db
        .collection(viewName)
        .drop()
        .catch(() => {});
      await db.createCollection(viewName, { viewOn: FIXTURE.table, pipeline: [] });

      await expect(
        adapter.mutations.insertRow?.(databaseName, viewName, { name: "Should Fail" })
      ).rejects.toThrow();
    } finally {
      await client
        .db(databaseName)
        .collection(viewName)
        .drop()
        .catch(() => {});
      await client.close();
    }
  });

  it("createTable/renameTable/truncateTable/dropTable roundtrip - maps onto collection ops (F110)", async () => {
    const table = "qyre_test_ddl";
    const renamed = "qyre_test_ddl_renamed";
    await adapter.ddl?.createTable?.(databaseName, table, []);
    const created = await adapter.getTable(databaseName, table);
    expect(created.kind).toBe("collection");

    await adapter.ddl?.renameTable?.(databaseName, table, renamed);
    await expect(adapter.getTable(databaseName, renamed)).resolves.toMatchObject({
      name: renamed
    });

    await adapter.mutations.insertRow?.(databaseName, renamed, { hello: "world" });
    await adapter.ddl?.truncateTable?.(databaseName, renamed);
    const afterTruncate = await adapter.getRows(databaseName, renamed, 0, 10);
    expect(afterTruncate.rows).toHaveLength(0);

    await adapter.ddl?.dropTable?.(databaseName, renamed);
    const overview = await adapter.getOverview();
    const schema = overview.schemas.find((candidate) => candidate.name === databaseName);
    expect(schema?.tables).not.toContain(renamed);
  });

  it("createIndex/dropIndex roundtrip - maps onto MongoDB's own index API (F112)", async () => {
    const table = "qyre_test_ddl_index";
    const indexName = "idx_qyre_test_ddl_index_code";
    await adapter.ddl?.createTable?.(databaseName, table, []);
    await adapter.ddl?.createIndex?.(databaseName, table, {
      name: indexName,
      columns: ["code"],
      unique: true
    });

    const withIndex = await adapter.getTable(databaseName, table);
    expect(withIndex.indexes?.find((index) => index.name === indexName)).toMatchObject({
      columns: ["code"],
      unique: true
    });

    await adapter.mutations.insertRow?.(databaseName, table, { code: 1 });
    await expect(adapter.mutations.insertRow?.(databaseName, table, { code: 1 })).rejects.toThrow();

    await adapter.ddl?.dropIndex?.(databaseName, table, indexName);
    const withoutIndex = await adapter.getTable(databaseName, table);
    expect(withoutIndex.indexes?.some((index) => index.name === indexName)).toBe(false);

    await adapter.ddl?.dropTable?.(databaseName, table);
  });

  it("replaces a whole document by _id, deserializing relaxed EJSON, and reports matched: 1 (F100)", async () => {
    const page = await adapter.getRows(databaseName, FIXTURE.table, 0, 10);
    const ada = page.rows.find((row) => row.name === "Ada Lovelace");
    const id = String(ada?._id);

    const result = await adapter.mutations.updateRowByKey?.(
      databaseName,
      FIXTURE.table,
      { _id: id },
      {
        name: "Ada Lovelace",
        email: "ada@example.com",
        joinedAt: { $date: "2024-01-01T00:00:00.000Z" }
      }
    );
    expect(result).toEqual({ matched: 1 });

    const after = await adapter.getRows(databaseName, FIXTURE.table, 0, 10);
    const updated = after.rows.find((row) => String(row._id) === id);
    expect(updated?.joinedAt).toBeInstanceOf(Date);
    expect(updated?.profile).toBeUndefined();
  });

  it("reports matched: 0 for an _id that doesn't match any document (F100)", async () => {
    const result = await adapter.mutations.updateRowByKey?.(
      databaseName,
      FIXTURE.table,
      { _id: "507f1f77bcf86cd799439011" },
      { name: "Nobody" }
    );
    expect(result).toEqual({ matched: 0 });
  });

  it("replaces the document when expectedOriginal matches what's currently stored (F125 lost-update protection)", async () => {
    const client = new MongoClient(mongoUrl);
    try {
      await client.connect();
      const collection = client.db(databaseName).collection(FIXTURE.table);
      const inserted = await collection.insertOne({ name: "Original", email: "a@x.com" });
      const id = String(inserted.insertedId);

      const result = await adapter.mutations.updateRowByKey?.(
        databaseName,
        FIXTURE.table,
        { _id: id },
        { name: "Changed", email: "a@x.com" },
        { _id: { $oid: id }, name: "Original", email: "a@x.com" }
      );
      expect(result).toEqual({ matched: 1 });

      const after = await collection.findOne({ _id: inserted.insertedId });
      expect(after?.name).toBe("Changed");
    } finally {
      await client.close();
    }
  });

  it("rejects the replace with matched: 0 when expectedOriginal no longer matches what's stored (F125 lost-update protection)", async () => {
    const client = new MongoClient(mongoUrl);
    try {
      await client.connect();
      const collection = client.db(databaseName).collection(FIXTURE.table);
      const inserted = await collection.insertOne({ name: "Original", email: "a@x.com" });
      const id = String(inserted.insertedId);

      await collection.updateOne({ _id: inserted.insertedId }, { $set: { name: "Concurrent" } });

      const result = await adapter.mutations.updateRowByKey?.(
        databaseName,
        FIXTURE.table,
        { _id: id },
        { name: "My Edit", email: "a@x.com" },
        { _id: { $oid: id }, name: "Original", email: "a@x.com" }
      );
      expect(result).toEqual({ matched: 0 });

      const after = await collection.findOne({ _id: inserted.insertedId });
      expect(after?.name).toBe("Concurrent");
    } finally {
      await client.close();
    }
  });

  it("updates staged grid fields, preserves unrelated data and BSON types, and rejects stale originals", async () => {
    const client = new MongoClient(mongoUrl);
    try {
      await client.connect();
      const collection = client.db(databaseName).collection(FIXTURE.table);
      const joinedAt = new Date("2024-01-01T00:00:00.000Z");
      const bytes = new Binary(Buffer.from([0]));
      const inserted = await collection.insertOne({
        name: "Grid Original",
        joinedAt,
        bytes,
        unrelated: { keep: true }
      });
      const key = { _id: String(inserted.insertedId) };

      const result = await adapter.mutations.updateFieldsByKey?.(
        databaseName,
        FIXTURE.table,
        key,
        {
          name: "Grid Changed",
          joinedAt: "2025-02-03T04:05:06.000Z",
          bytes: "00cafe"
        },
        {
          name: "Grid Original",
          joinedAt: joinedAt.toISOString(),
          bytes: { type: "Buffer", data: [0] }
        },
        []
      );
      expect(result).toEqual({ matched: 1 });

      const after = await collection.findOne({ _id: inserted.insertedId });
      expect(after?.name).toBe("Grid Changed");
      expect(after?.joinedAt).toBeInstanceOf(Date);
      expect((after?.joinedAt as Date).toISOString()).toBe("2025-02-03T04:05:06.000Z");
      expect(Array.from((after?.bytes as Binary).buffer)).toEqual([0, 202, 254]);
      expect(after?.unrelated).toEqual({ keep: true });

      await collection.updateOne({ _id: inserted.insertedId }, { $set: { name: "Concurrent" } });
      const conflict = await adapter.mutations.updateFieldsByKey?.(
        databaseName,
        FIXTURE.table,
        key,
        { name: "My stale edit" },
        { name: "Grid Changed" },
        []
      );
      expect(conflict).toEqual({ matched: 0 });
      expect((await collection.findOne({ _id: inserted.insertedId }))?.name).toBe("Concurrent");
    } finally {
      await client.close();
    }
  });

  it("updates regex, timestamp, code, MinKey, and MaxKey fields without degrading BSON types", async () => {
    const client = new MongoClient(mongoUrl);
    try {
      await client.connect();
      const collection = client.db(databaseName).collection(FIXTURE.table);
      const originalTimestamp = Timestamp.fromBits(1, 100);
      const inserted = await collection.insertOne({
        regexField: new BSONRegExp("^old", "i"),
        timestampField: originalTimestamp,
        codeField: new Code("return x;", { x: 1 }),
        minKeyField: new MinKey(),
        maxKeyField: new MaxKey()
      });
      const result = await adapter.mutations.updateFieldsByKey?.(
        databaseName,
        FIXTURE.table,
        { _id: String(inserted.insertedId) },
        {
          regexField: { pattern: "^new", options: "im" },
          timestampField: { t: 200, i: 2 },
          codeField: { code: "return x + 1;", scope: { x: 2 } },
          minKeyField: { $minKey: 1 },
          maxKeyField: { $maxKey: 1 }
        },
        {
          regexField: { pattern: "^old", options: "i" },
          timestampField: { t: 100, i: 1 },
          codeField: { code: "return x;", scope: { x: 1 } },
          minKeyField: { $minKey: 1 },
          maxKeyField: { $maxKey: 1 }
        },
        []
      );
      expect(result).toEqual({ matched: 1 });

      const after = await collection.findOne({ _id: inserted.insertedId });
      expect(after?.regexField).toBeInstanceOf(RegExp);
      expect((after?.regexField as RegExp).source).toBe("^new");
      expect((after?.regexField as RegExp).flags).toBe("im");
      expect(after?.timestampField).toBeInstanceOf(Timestamp);
      expect(normalizeBsonValue(after?.timestampField)).toEqual({ t: 200, i: 2 });
      expect(after?.codeField).toBeInstanceOf(Code);
      expect(normalizeBsonValue(after?.codeField)).toEqual({
        code: "return x + 1;",
        scope: { x: 2 }
      });
      expect(after?.minKeyField).toBeInstanceOf(MinKey);
      expect(after?.maxKeyField).toBeInstanceOf(MaxKey);
    } finally {
      await client.close();
    }
  });

  it("deletes documents by _id list and reports deleted: 2 (F101)", async () => {
    const client = new MongoClient(mongoUrl);
    try {
      await client.connect();
      const collection = client.db(databaseName).collection(FIXTURE.table);
      const inserted = await collection.insertMany([
        { name: "Delete Test 1" },
        { name: "Delete Test 2" }
      ]);
      const ids = Object.values(inserted.insertedIds).map((id) => String(id));

      const result = await adapter.mutations.deleteRowsByKey?.(
        databaseName,
        FIXTURE.table,
        ids.map((id) => ({ _id: id }))
      );
      expect(result).toEqual({ deleted: 2 });

      const remaining = await collection.countDocuments({
        _id: { $in: Object.values(inserted.insertedIds) }
      });
      expect(remaining).toBe(0);
    } finally {
      await client.close();
    }
  });

  it("reports a lower deleted count when some ids no longer match any document (F101)", async () => {
    const client = new MongoClient(mongoUrl);
    try {
      await client.connect();
      const collection = client.db(databaseName).collection(FIXTURE.table);
      const inserted = await collection.insertOne({ name: "Delete Test" });

      const result = await adapter.mutations.deleteRowsByKey?.(databaseName, FIXTURE.table, [
        { _id: String(inserted.insertedId) },
        { _id: "507f1f77bcf86cd799439011" }
      ]);
      expect(result).toEqual({ deleted: 1 });
    } finally {
      await client.close();
    }
  });

  it("getDocumentText returns the document as relaxed EJSON, preserving ObjectId/Date (F125)", async () => {
    const client = new MongoClient(mongoUrl);
    try {
      await client.connect();
      const collection = client.db(databaseName).collection(FIXTURE.table);
      const joinedAt = new Date("2024-01-01T00:00:00.000Z");
      const inserted = await collection.insertOne({ name: "EJSON Roundtrip", joinedAt });
      const id = String(inserted.insertedId);

      const text = await adapter.mutations.getDocumentText?.(databaseName, FIXTURE.table, id);
      expect(text).toBeDefined();
      expect(text).toContain(`"$oid":"${id}"`);
      expect(text).toContain('"$date"');

      const parsed = EJSON.parse(text ?? "", { relaxed: true }) as {
        _id: { _bsontype?: string; toString(): string };
        joinedAt: Date;
      };
      expect(parsed._id._bsontype).toBe("ObjectId");
      expect(parsed._id.toString()).toBe(id);
      expect(parsed.joinedAt).toBeInstanceOf(Date);
      expect(parsed.joinedAt.getTime()).toBe(joinedAt.getTime());
    } finally {
      await client.close();
    }
  });

  it("getDocumentText returns undefined for an _id that doesn't match any document (F125)", async () => {
    const text = await adapter.mutations.getDocumentText?.(
      databaseName,
      FIXTURE.table,
      "507f1f77bcf86cd799439011"
    );
    expect(text).toBeUndefined();
  });

  it("rejects the query runner - MongoDB has no query language for it (see the spec)", async () => {
    await expect(adapter.runReadOnlyQuery("SELECT 1")).rejects.toThrow(
      /does not support the SQL query runner/
    );
  });

  it("a collection with no documents reports zero rows and only the _id field", async () => {
    const client = new MongoClient(mongoUrl);
    const emptyCollectionName = "qyre_test_empty";
    try {
      await client.connect();
      const db = client.db(databaseName);
      await db
        .collection(emptyCollectionName)
        .drop()
        .catch(() => {});
      await db.createCollection(emptyCollectionName);

      const table = await adapter.getTable(databaseName, emptyCollectionName);
      expect(table.columns.map((column) => column.name)).toEqual(["_id"]);
      expect(table.rowCount).toBe(0);

      const page = await adapter.getRows(databaseName, emptyCollectionName, 0, 10);
      expect(page.rows).toEqual([]);
    } finally {
      await client
        .db(databaseName)
        .collection(emptyCollectionName)
        .drop()
        .catch(() => {});
      await client.close();
    }
  });

  it("getRows/getTable pass the configured statement timeout as maxTimeMS, which MongoDB enforces (F032)", async () => {
    const client = new MongoClient(mongoUrl);
    try {
      await client.connect();
      await expect(
        client
          .db(databaseName)
          .collection(FIXTURE.table)
          .find({ $where: "sleep(2000) || true" }, { maxTimeMS: 200 })
          .toArray()
      ).rejects.toThrow(/exceeded time limit/i);
    } finally {
      await client.close();
    }
  });

  it("cancels a running operation via killOp, found through the currentOp comment tag (F126)", async () => {
    const client = new MongoClient(mongoUrl);
    const callbacks = new Map<string, () => Promise<void>>();
    try {
      await client.connect();
      const operationId = "f126-cancel-test";
      registerMongoCancellation(
        client,
        {
          register: (id, cancel) => callbacks.set(id, cancel),
          unregister: (id) => callbacks.delete(id)
        },
        operationId,
        databaseName
      );

      const slowFind = client
        .db(databaseName)
        .collection(FIXTURE.table)
        .find({ $where: "sleep(3000) || true" }, { comment: operationId })
        .toArray();

      await new Promise((resolve) => setTimeout(resolve, 300));
      await callbacks.get(operationId)?.();

      await expect(slowFind).rejects.toMatchObject({ code: expect.any(Number) });
      const rejection = await slowFind.catch((error: unknown) => error);
      expect(isMongoCancelError(rejection)).toBe(true);

      expect(await client.db(databaseName).command({ ping: 1 })).toMatchObject({ ok: 1 });
    } finally {
      await client.close();
    }
  });
});
