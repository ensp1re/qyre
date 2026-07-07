/**
 * Integration tests for {@link MongodbAdapter} against a real MongoDB database.
 *
 * Requires QYRE_TEST_MONGO_URL (see docs/RELIABILITY.md). We never silently skip required
 * verification: a missing env var fails these tests with an actionable message instead of passing
 * trivially.
 */
import { FIXTURE, requireTestMongoUrl, setupMongoFixture } from "@qyre/testing";
import { Binary, Long, MongoClient, ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongodbAdapter } from "./index.js";

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

  it("introspects best-effort fields (including a nested one), flags _id as the primary key, and reports no indexes", async () => {
    const table = await adapter.getTable(databaseName, FIXTURE.table);

    expect(table.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["_id", "name", "email", "profile"])
    );
    const idColumn = table.columns.find((column) => column.name === "_id");
    expect(idColumn?.isPrimaryKey).toBe(true);
    expect(idColumn?.isForeignKey).toBe(false);

    expect(table.indexes).toEqual([]);
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
});
