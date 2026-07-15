import { describe, expect, it } from "vitest";
import { buildSqliteExplainSql, sqlitePlanLines } from "../src/query/explain.js";

describe("SQLite EXPLAIN construction (F128)", () => {
  it("builds a query plan without retaining a trailing semicolon", () => {
    expect(buildSqliteExplainSql("SELECT 1;")).toBe("EXPLAIN QUERY PLAN SELECT 1");
  });

  it("normalizes id/parent rows into an indented tree", () => {
    expect(
      sqlitePlanLines([
        { id: 2, parent: 0, detail: "SCAN users" },
        { id: 4, parent: 2, detail: "SEARCH orders" }
      ])
    ).toEqual(["SCAN users", "  SEARCH orders"]);
  });
});
