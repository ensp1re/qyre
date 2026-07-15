import type { TableMetadata } from "@qyre/core";
import { describe, expect, it, vi } from "vitest";
import {
  assertMutable,
  resolveBatchOps,
  resolveInsertValues,
  resolveKey,
  resolveKeys,
  resolveUpdateChanges
} from "../../src/services/row-mutation-validation.js";
import { makeFakeAdapter } from "../support/fake-adapter.js";

const SQL_TABLE: TableMetadata = {
  schema: "public",
  name: "users",
  kind: "table",
  columns: [
    { name: "id", dataType: "int4", nullable: false, isPrimaryKey: true, isForeignKey: false },
    {
      name: "name",
      dataType: "varchar",
      nullable: false,
      isPrimaryKey: false,
      isForeignKey: false
    },
    { name: "bio", dataType: "text", nullable: true, isPrimaryKey: false, isForeignKey: false },
    { name: "active", dataType: "bool", nullable: false, isPrimaryKey: false, isForeignKey: false },
    {
      name: "created_at",
      dataType: "timestamp",
      nullable: false,
      isPrimaryKey: false,
      isForeignKey: false
    },
    { name: "tags", dataType: "jsonb", nullable: true, isPrimaryKey: false, isForeignKey: false }
  ],
  permissions: { select: true, insert: true, update: true, delete: true }
};

const COMPOSITE_KEY_TABLE: TableMetadata = {
  schema: "public",
  name: "memberships",
  kind: "table",
  columns: [
    { name: "org_id", dataType: "int4", nullable: false, isPrimaryKey: true, isForeignKey: false },
    { name: "user_id", dataType: "int4", nullable: false, isPrimaryKey: true, isForeignKey: false },
    { name: "role", dataType: "text", nullable: false, isPrimaryKey: false, isForeignKey: false }
  ],
  permissions: { select: true, insert: true, update: true, delete: true }
};

const NO_PK_TABLE: TableMetadata = {
  ...SQL_TABLE,
  columns: SQL_TABLE.columns.map((column) => ({ ...column, isPrimaryKey: false }))
};

const MONGO_TABLE: TableMetadata = {
  schema: "test",
  name: "users",
  kind: "collection",
  columns: [
    { name: "_id", dataType: "objectId", nullable: false, isPrimaryKey: true, isForeignKey: false },
    { name: "name", dataType: "string", nullable: false, isPrimaryKey: false, isForeignKey: false }
  ],
  permissions: { select: true, insert: true, update: true, delete: true }
};

describe("assertMutable (F099)", () => {
  it("allows a table with insert permission", () => {
    expect(() => assertMutable(SQL_TABLE, "insert")).not.toThrow();
  });

  it("rejects a view with 400", () => {
    const view: TableMetadata = { ...SQL_TABLE, kind: "view" };
    expect(() => assertMutable(view, "insert")).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("rejects a materialized view with 400", () => {
    const view: TableMetadata = { ...SQL_TABLE, kind: "materialized-view" };
    expect(() => assertMutable(view, "insert")).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("rejects a table lacking the specific permission with 403", () => {
    const readOnly: TableMetadata = {
      ...SQL_TABLE,
      permissions: { select: true, insert: false, update: false, delete: false }
    };
    expect(() => assertMutable(readOnly, "insert")).toThrow(
      expect.objectContaining({ statusCode: 403 })
    );
  });

  it("fails closed (403) when permissions are entirely undefined", () => {
    const noPermissions: TableMetadata = { ...SQL_TABLE, permissions: undefined };
    expect(() => assertMutable(noPermissions, "insert")).toThrow(
      expect.objectContaining({ statusCode: 403 })
    );
  });

  it("allows a MongoDB collection", () => {
    const collection: TableMetadata = { ...SQL_TABLE, kind: "collection" };
    expect(() => assertMutable(collection, "insert")).not.toThrow();
  });
});

describe("resolveInsertValues (F099)", () => {
  it("passes typed values through unchanged for a well-formed body", () => {
    expect(
      resolveInsertValues(
        SQL_TABLE,
        { id: 1, name: "Ada", active: true, created_at: "2024-01-01T00:00:00.000Z" },
        "postgres"
      )
    ).toEqual({ id: 1, name: "Ada", active: true, created_at: "2024-01-01T00:00:00.000Z" });
  });

  it("rejects an unknown column", () => {
    expect(() => resolveInsertValues(SQL_TABLE, { nope: 1 }, "postgres")).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("rejects a numeric string for a numeric column (JSON number required, unlike RowFilter)", () => {
    expect(() => resolveInsertValues(SQL_TABLE, { id: "1" }, "postgres")).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("rejects a non-string for a text column", () => {
    expect(() => resolveInsertValues(SQL_TABLE, { name: 42 }, "postgres")).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("rejects a non-boolean for a boolean column", () => {
    expect(() => resolveInsertValues(SQL_TABLE, { active: "true" }, "postgres")).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("rejects an unparseable date string", () => {
    expect(() => resolveInsertValues(SQL_TABLE, { created_at: "not-a-date" }, "postgres")).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("allows null for a nullable column", () => {
    expect(resolveInsertValues(SQL_TABLE, { bio: null }, "postgres")).toEqual({ bio: null });
  });

  it("rejects null for a non-nullable column", () => {
    expect(() => resolveInsertValues(SQL_TABLE, { name: null }, "postgres")).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("rejects a structured (jsonb) column - not editable via the flat map", () => {
    expect(() => resolveInsertValues(SQL_TABLE, { tags: ["a"] }, "postgres")).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("skips per-column validation entirely for MongoDB - passes the body through as-is", () => {
    const body = { anyField: "anything", nested: { a: 1 } };
    expect(resolveInsertValues(SQL_TABLE, body, "mongodb")).toBe(body);
  });
});

describe("resolveUpdateChanges (F100)", () => {
  it("passes typed non-PK values through unchanged", () => {
    expect(resolveUpdateChanges(SQL_TABLE, { name: "Grace", active: false }, "postgres")).toEqual({
      name: "Grace",
      active: false
    });
  });

  it("rejects a primary-key column - never editable via update", () => {
    expect(() => resolveUpdateChanges(SQL_TABLE, { id: 2 }, "postgres")).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("rejects an empty changes map - nothing to update", () => {
    expect(() => resolveUpdateChanges(SQL_TABLE, {}, "postgres")).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("rejects an unknown column", () => {
    expect(() => resolveUpdateChanges(SQL_TABLE, { nope: 1 }, "postgres")).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("skips per-column validation entirely for MongoDB - passes the body through as-is", () => {
    const body = { name: "Grace" };
    expect(resolveUpdateChanges(MONGO_TABLE, body, "mongodb")).toBe(body);
  });
});

describe("resolveKey (F100)", () => {
  it("resolves and coerces a single-column primary key", () => {
    expect(resolveKey(SQL_TABLE, { id: 1 }, "postgres")).toEqual({ id: 1 });
  });

  it("resolves a composite primary key matched as a full set", () => {
    expect(resolveKey(COMPOSITE_KEY_TABLE, { org_id: 1, user_id: 2 }, "postgres")).toEqual({
      org_id: 1,
      user_id: 2
    });
  });

  it("rejects a composite key missing one of its columns", () => {
    expect(() => resolveKey(COMPOSITE_KEY_TABLE, { org_id: 1 }, "postgres")).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("rejects a key naming a column that is not part of the primary key", () => {
    expect(() => resolveKey(SQL_TABLE, { id: 1, name: "Ada" }, "postgres")).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("rejects a table with no primary key at all", () => {
    expect(() => resolveKey(NO_PK_TABLE, { id: 1 }, "postgres")).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("resolves MongoDB's single-field _id key via the same generic column logic", () => {
    expect(resolveKey(MONGO_TABLE, { _id: "507f1f77bcf86cd799439011" }, "mongodb")).toEqual({
      _id: "507f1f77bcf86cd799439011"
    });
  });

  it("rejects a malformed MongoDB _id (not a 24-hex-char ObjectId string)", () => {
    expect(() => resolveKey(MONGO_TABLE, { _id: "not-an-object-id" }, "mongodb")).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });
});

describe("resolveKeys (F101)", () => {
  it("resolves and coerces every key in the list", () => {
    expect(resolveKeys(SQL_TABLE, [{ id: 1 }, { id: 2 }], "postgres")).toEqual([
      { id: 1 },
      { id: 2 }
    ]);
  });

  it("rejects an empty key list - nothing to delete", () => {
    expect(() => resolveKeys(SQL_TABLE, [], "postgres")).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("rejects if any key in the list is invalid", () => {
    expect(() => resolveKeys(SQL_TABLE, [{ id: 1 }, { id: "not-a-number" }], "postgres")).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });

  it("resolves a list of MongoDB _id keys", () => {
    expect(
      resolveKeys(
        MONGO_TABLE,
        [{ _id: "507f1f77bcf86cd799439011" }, { _id: "507f1f77bcf86cd799439012" }],
        "mongodb"
      )
    ).toEqual([{ _id: "507f1f77bcf86cd799439011" }, { _id: "507f1f77bcf86cd799439012" }]);
  });
});

describe("resolveBatchOps (F102/F135)", () => {
  it("resolves and coerces an insert op", async () => {
    const adapter = makeFakeAdapter({ getTable: async () => SQL_TABLE });
    const resolved = await resolveBatchOps(adapter, [
      { type: "insert", schema: "public", table: "users", values: { id: 1, name: "Ada" } }
    ]);
    expect(resolved).toEqual([
      { type: "insert", schema: "public", table: "users", values: { id: 1, name: "Ada" } }
    ]);
  });

  it("resolves and coerces an update op", async () => {
    const adapter = makeFakeAdapter({ getTable: async () => SQL_TABLE });
    const resolved = await resolveBatchOps(adapter, [
      {
        type: "update",
        schema: "public",
        table: "users",
        key: { id: 1 },
        changes: { name: "Grace" }
      }
    ]);
    expect(resolved).toEqual([
      {
        type: "update",
        schema: "public",
        table: "users",
        key: { id: 1 },
        changes: { name: "Grace" }
      }
    ]);
  });

  it("resolves and coerces a delete op", async () => {
    const adapter = makeFakeAdapter({ getTable: async () => SQL_TABLE });
    const resolved = await resolveBatchOps(adapter, [
      { type: "delete", schema: "public", table: "users", keys: [{ id: 1 }, { id: 2 }] }
    ]);
    expect(resolved).toEqual([
      { type: "delete", schema: "public", table: "users", keys: [{ id: 1 }, { id: 2 }] }
    ]);
  });

  it("rejects an op against a view with 400", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({ ...SQL_TABLE, kind: "view" })
    });
    await expect(
      resolveBatchOps(adapter, [{ type: "insert", schema: "public", table: "v", values: {} }])
    ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  it("rejects an op lacking the specific permission with 403", async () => {
    const adapter = makeFakeAdapter({
      getTable: async () => ({
        ...SQL_TABLE,
        permissions: { select: true, insert: false, update: false, delete: false }
      })
    });
    await expect(
      resolveBatchOps(adapter, [
        { type: "insert", schema: "public", table: "users", values: { name: "Ada" } }
      ])
    ).rejects.toThrow(expect.objectContaining({ statusCode: 403 }));
  });

  it("rejects an op with an unknown column with 400", async () => {
    const adapter = makeFakeAdapter({ getTable: async () => SQL_TABLE });
    await expect(
      resolveBatchOps(adapter, [
        { type: "insert", schema: "public", table: "users", values: { nope: 1 } }
      ])
    ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  it("introspects each distinct schema.table exactly once, not once per op (F135)", async () => {
    const getTable = vi.fn(async () => SQL_TABLE);
    const adapter = makeFakeAdapter({ getTable });

    await resolveBatchOps(adapter, [
      { type: "insert", schema: "public", table: "users", values: { id: 1, name: "Ada" } },
      {
        type: "update",
        schema: "public",
        table: "users",
        key: { id: 1 },
        changes: { name: "Grace" }
      },
      { type: "delete", schema: "public", table: "users", keys: [{ id: 2 }] }
    ]);

    expect(getTable).toHaveBeenCalledTimes(1);
    expect(getTable).toHaveBeenCalledWith("public", "users");
  });

  it("introspects once per distinct table and preserves the original op order across tables", async () => {
    const getTable = vi.fn(async (schema: string, table: string) =>
      table === "memberships" ? COMPOSITE_KEY_TABLE : SQL_TABLE
    );
    const adapter = makeFakeAdapter({ getTable });

    const resolved = await resolveBatchOps(adapter, [
      { type: "insert", schema: "public", table: "users", values: { id: 1, name: "Ada" } },
      {
        type: "insert",
        schema: "public",
        table: "memberships",
        values: { org_id: 1, user_id: 1, role: "admin" }
      },
      { type: "delete", schema: "public", table: "users", keys: [{ id: 2 }] }
    ]);

    expect(getTable).toHaveBeenCalledTimes(2);
    expect(resolved.map((op) => op.table)).toEqual(["users", "memberships", "users"]);
  });

  it("still throws before commitBatch would run when a later op in the batch fails validation", async () => {
    const adapter = makeFakeAdapter({ getTable: async () => SQL_TABLE });
    await expect(
      resolveBatchOps(adapter, [
        { type: "insert", schema: "public", table: "users", values: { id: 1, name: "Ada" } },
        { type: "insert", schema: "public", table: "users", values: { nope: 1 } }
      ])
    ).rejects.toThrow(expect.objectContaining({ statusCode: 400 }));
  });
});
