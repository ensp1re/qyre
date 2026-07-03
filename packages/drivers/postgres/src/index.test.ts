import type { ConnectionTarget } from "@humbdb/core";
import { describe, expect, it } from "vitest";
import { coerceUnknownQuotedIdentifiers, postgresAdapterFactory } from "./index.js";

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
});
