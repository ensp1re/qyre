import type { TableMetadata } from "@qyre/core";
import { describe, expect, it } from "vitest";
import { assertMutable, resolveInsertValues } from "../../src/services/row-mutation-validation.js";

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
