import { describe, expect, it } from "vitest";
import { buildPostgresExplainSql, postgresPlanLines } from "../src/query/explain.js";

describe("PostgreSQL EXPLAIN construction (F128)", () => {
  it("builds plain and analyzed text plans without retaining a trailing semicolon", () => {
    expect(buildPostgresExplainSql("SELECT 1;", false)).toBe("EXPLAIN (FORMAT TEXT) SELECT 1");
    expect(buildPostgresExplainSql("SELECT 1", true)).toBe(
      "EXPLAIN (ANALYZE, FORMAT TEXT) SELECT 1"
    );
  });

  it("normalizes the QUERY PLAN column", () => {
    expect(postgresPlanLines([{ "QUERY PLAN": "Seq Scan\n  Filter" }])).toEqual([
      "Seq Scan",
      "  Filter"
    ]);
  });
});
