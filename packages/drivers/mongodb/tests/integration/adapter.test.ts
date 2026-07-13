/**
 * Integration tests for {@link MongodbAdapter} against a real MongoDB database.
 *
 * Requires QYRE_TEST_MONGO_URL (see docs/RELIABILITY.md). We never silently skip required
 * verification: a missing env var fails these tests with an actionable message instead of passing
 * trivially.
 */
import { FIXTURE, requireTestMongoUrl, setupMongoFixture } from "@qyre/testing";
import { EJSON } from "bson";
import { Binary, Long, MongoClient, ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isMongoCancelError, registerMongoCancellation } from "../../src/cancellation.js";
import { MongodbAdapter } from "../../src/index.js";

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

    // _id: always present, always an ObjectId - never nullable.
    expect(column("_id")).toMatchObject({ dataType: "objectId", nullable: false });
    // name/email: strings present on all 3 fixture documents - not nullable.
    expect(column("name")).toMatchObject({ dataType: "string", nullable: false });
    expect(column("email")).toMatchObject({ dataType: "string", nullable: false });
    // profile: a nested document, but only Ada Lovelace's fixture row has it - nullable.
    expect(column("profile")).toMatchObject({ dataType: "object", nullable: true });
  });

  it("returns a page of documents; _id stays a live ObjectId at this layer, serializing to its hex string only once JSON-encoded (same precedent as Buffer/Date elsewhere)", async () => {
    const page = await adapter.getRows(databaseName, FIXTURE.table, 0, 10);
    expect(page.rows).toHaveLength(FIXTURE.rowCount);
    expect(page.columns).toEqual(expect.arrayContaining(["_id", "name", "email"]));
    for (const row of page.rows) {
      expect(row._id).toBeInstanceOf(ObjectId);
      expect(JSON.stringify(row._id)).toMatch(/^"[0-9a-f]{24}"$/);
    }
  });

  it("pages deterministically with no duplicate or skipped documents (F026 regression)", async () => {
    // Previously: find().skip().limit() with no sort has no ordering guarantee between calls, so
    // paging one document at a time could show the same document twice or skip one entirely.
    const seenIds = new Set<string>();
    for (let page = 0; page < FIXTURE.rowCount; page++) {
      const result = await adapter.getRows(databaseName, FIXTURE.table, page, 1);
      expect(result.rows).toHaveLength(1);
      seenIds.add(String(result.rows[0]?._id));
    }
    expect(seenIds.size).toBe(FIXTURE.rowCount);

    // Repeating the same page twice must return the same document both times.
    const first = await adapter.getRows(databaseName, FIXTURE.table, 1, 1);
    const second = await adapter.getRows(databaseName, FIXTURE.table, 1, 1);
    expect(String(first.rows[0]?._id)).toBe(String(second.rows[0]?._id));
  });

  it("renders a nested document field via the structured-cell-value shape (F016 dependency)", async () => {
    const page = await adapter.getRows(databaseName, FIXTURE.table, 0, 10);
    const ada = page.rows.find((row) => row.name === "Ada Lovelace");
    expect(ada?.profile).toEqual({ account: { tags: ["admin", "beta"] } });
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
      // A Long past Number.MAX_SAFE_INTEGER becomes an exact string, matching F019's
      // bigint-as-string convention for Postgres/MySQL/SQLite - not the raw
      // { high, low, unsigned } shape Long's own JSON.stringify would otherwise produce.
      expect(ada?.bigNumber).toBe("9007199254740993");
      // A Binary becomes the same { type: "Buffer", data: [...] } shape Node's own
      // Buffer.prototype.toJSON() produces, reusing packages/ui's existing binary-value chip/
      // hex-dump viewer instead of a second, inconsistent representation.
      expect(ada?.binaryValue).toEqual({ type: "Buffer", data: [...Buffer.from("hello")] });
      // A small Long (the driver itself already demotes these to a plain number on read, not
      // something this adapter's normalization does) stays a plain number, not needlessly
      // stringified - matching F019's "only stringify when the value actually can't fit" rule.
      expect(ada?.smallNumber).toBe(42);
    } finally {
      await client.close();
    }
  });

  it("reports full writability for the unauthenticated fixture connection (F095)", async () => {
    // The docker-compose/CI MongoDB fixture runs with no authorization enabled at all - a real
    // unrestricted local connection, matching mongod's own default. See
    // packages/drivers/mongodb/src/permissions.ts's top comment for why a genuinely *restricted*
    // fixture user isn't exercised live here (MongoDB only enforces role restrictions once
    // authorization is enabled globally on the server - unit tests in permissions.test.ts cover
    // that case against real, live-verified connectionStatus response shapes instead).
    await expect(adapter.getCapabilities()).resolves.toEqual({
      supportsSql: false,
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
    // Whole-document replace, not a changed-fields $set: a field absent from the replacement
    // document (here, `profile`) must be gone afterward, not merely left untouched.
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

      // Someone else changed the document after it was loaded for editing.
      await collection.updateOne({ _id: inserted.insertedId }, { $set: { name: "Concurrent" } });

      const result = await adapter.mutations.updateRowByKey?.(
        databaseName,
        FIXTURE.table,
        { _id: id },
        { name: "My Edit", email: "a@x.com" },
        { _id: { $oid: id }, name: "Original", email: "a@x.com" }
      );
      expect(result).toEqual({ matched: 0 });

      // The concurrent write is preserved - the stale replace never ran.
      const after = await collection.findOne({ _id: inserted.insertedId });
      expect(after?.name).toBe("Concurrent");
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

      // The text round-trips back to real BSON, not ambiguous plain JSON. Checked via `_bsontype`/
      // `.toString()` rather than `instanceof ObjectId` - this test's own `bson` import and the one
      // `mongodb` (a CommonJS package) resolves internally are two separate compiled copies of the
      // library (a real "dual package hazard"), so a value either produces is never `instanceof`
      // the other's class even when byte-identical; EJSON itself sidesteps this the same way.
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
    // getRows/getTable's public API takes no user-controllable filter (MongoDB browsing here is
    // deliberately narrow - no query language, see the spec's "Why this engine is scoped
    // differently"), so there's no way to force a *real* getRows() call to run long enough to
    // prove the timeout fires end to end (unlike Postgres/MySQL's runReadOnlyQuery, which accepts
    // arbitrary SQL). This instead verifies the exact mechanism the adapter relies on - a `$where`
    // server-side sleep makes a real scan slow, and confirms MongoDB itself aborts it once
    // maxTimeMS elapses, exactly as getRows/getTable pass `this.statementTimeoutMs` through.
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
    // Same reasoning as the timeout test above: getRows' public API has no way to force a real
    // call to run long enough to cancel, so this proves the mechanism registerMongoCancellation
    // relies on directly - tag an operation with `comment`, find it in currentOp by that same
    // comment, and killOp it - against a genuinely slow $where scan.
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

      // Give the operation time to actually start executing server-side before currentOp can see
      // it - registration itself is synchronous, but the query only appears in currentOp once
      // MongoDB has begun running it.
      await new Promise((resolve) => setTimeout(resolve, 300));
      await callbacks.get(operationId)?.();

      await expect(slowFind).rejects.toMatchObject({ code: expect.any(Number) });
      const rejection = await slowFind.catch((error: unknown) => error);
      expect(isMongoCancelError(rejection)).toBe(true);

      // The connection is untouched - a fresh query on the same client still works.
      expect(await client.db(databaseName).command({ ping: 1 })).toMatchObject({ ok: 1 });
    } finally {
      await client.close();
    }
  });
});
