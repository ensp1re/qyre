import type { ConnectionTarget } from "@qyre/core";
import { describe, expect, it } from "vitest";
import { coerceUnknownQuotedIdentifiers, postgresAdapterFactory } from "../src/index.js";

describe("postgresAdapterFactory", () => {
  it("supports postgres targets", () => {
    const target: ConnectionTarget = { engine: "postgres", raw: "postgres://localhost/db" };
    expect(postgresAdapterFactory.supports(target)).toBe(true);
  });

  it("creates an adapter with the postgres engine", () => {
    const target: ConnectionTarget = { engine: "postgres", raw: "postgres://localhost/db" };
    const adapter = postgresAdapterFactory.create(target);
    expect(adapter.engine).toBe("postgres");
  });

  it("degrades a failed capability query to read-only and logs a warning (F092)", async () => {
    const adapter = postgresAdapterFactory.create({
      engine: "postgres",
      raw: "postgres://localhost/db"
    });
    const events: Array<{ level: string; message: string }> = [];
    adapter.onConnectionEvent = (level, message) => events.push({ level, message });
    // The adapter deliberately treats missing catalog access like a read-only role. A minimal
    // pool stub isolates that fallback without needing a real database failure.
    (adapter as unknown as { pool: { query: () => Promise<never> } }).pool = {
      query: async () => {
        throw new Error("pg_roles is unavailable");
      }
    };

    await expect(adapter.getCapabilities()).resolves.toEqual({
      supportsSql: true,
      rowExportFormats: ["csv", "json", "sql"],
      jsonExportMode: "json",
      supportsRowMutations: false,
      supportsDdl: false,
      supportsIndexManagement: false,
      supportsDatabaseManagement: false,
      supportsTransactions: false,
      readOnlyReason: "grants"
    });
    expect(events).toEqual([
      {
        level: "warn",
        message: expect.stringContaining("Postgres permission introspection failed")
      }
    ]);
  });
});

describe("coerceUnknownQuotedIdentifiers", () => {
  const knownIdentifiers = new Set(["employees", "department", "id"]);

  it("rewrites a double-quoted value that matches no real identifier to a string literal", () => {
    expect(
      coerceUnknownQuotedIdentifiers(
        `SELECT * FROM employees WHERE department="Support" LIMIT 10`,
        knownIdentifiers
      )
    ).toBe(`SELECT * FROM employees WHERE department='Support' LIMIT 10`);
  });

  it("leaves a double-quoted token that matches a real column/table name untouched", () => {
    const sql = `SELECT "id", "department" FROM "employees"`;
    expect(coerceUnknownQuotedIdentifiers(sql, knownIdentifiers)).toBe(sql);
  });

  it("escapes a single quote already present in the coerced value", () => {
    expect(coerceUnknownQuotedIdentifiers(`WHERE department="O'Brien"`, knownIdentifiers)).toBe(
      `WHERE department='O''Brien'`
    );
  });

  it("unescapes a doubled double-quote inside the token before comparing/rewriting", () => {
    expect(coerceUnknownQuotedIdentifiers(`WHERE name="Say ""hi"""`, knownIdentifiers)).toBe(
      `WHERE name='Say "hi"'`
    );
  });

  it("is a no-op when the query has no double-quoted tokens", () => {
    const sql = "SELECT * FROM employees WHERE department='Support'";
    expect(coerceUnknownQuotedIdentifiers(sql, knownIdentifiers)).toBe(sql);
  });

  it("does not touch a double-quote character that lives inside a single-quoted string literal", () => {
    const sql = `SELECT 'he said "hi" loudly' FROM employees`;
    expect(coerceUnknownQuotedIdentifiers(sql, knownIdentifiers)).toBe(sql);
  });

  it("does not touch a double-quote character inside a dollar-quoted block", () => {
    const sql = `SELECT $$he said "hi" loudly$$ FROM employees`;
    expect(coerceUnknownQuotedIdentifiers(sql, knownIdentifiers)).toBe(sql);
  });

  it("does not touch a double-quote character inside a tagged dollar-quoted block", () => {
    const sql = `SELECT $tag$he said "hi" loudly$tag$ FROM employees`;
    expect(coerceUnknownQuotedIdentifiers(sql, knownIdentifiers)).toBe(sql);
  });

  it("leaves a schema-qualified, double-quoted table reference untouched", () => {
    const identifiers = new Set(["public", "users"]);
    const sql = `SELECT * FROM "public"."users"`;
    expect(coerceUnknownQuotedIdentifiers(sql, identifiers)).toBe(sql);
  });

  it("leaves a double-quoted reference to a query-local column alias untouched", () => {
    const sql = `SELECT "a" FROM (SELECT 1 AS a) sub`;
    expect(coerceUnknownQuotedIdentifiers(sql, knownIdentifiers)).toBe(sql);
  });

  it("leaves a double-quoted reference to a quoted column alias untouched", () => {
    const sql = `SELECT "Total" FROM (SELECT 1 AS "Total") sub`;
    expect(coerceUnknownQuotedIdentifiers(sql, knownIdentifiers)).toBe(sql);
  });

  it("leaves a double-quoted reference to a CTE name untouched", () => {
    const sql = `WITH "recent" AS (SELECT 1 AS id) SELECT * FROM "recent"`;
    expect(coerceUnknownQuotedIdentifiers(sql, knownIdentifiers)).toBe(sql);
  });

  it("still coerces an unknown quoted value even when the query also has a string literal containing a quote", () => {
    const sql = `SELECT 'he said "hi"' , department="Support" FROM employees`;
    expect(coerceUnknownQuotedIdentifiers(sql, knownIdentifiers)).toBe(
      `SELECT 'he said "hi"' , department='Support' FROM employees`
    );
  });
});
