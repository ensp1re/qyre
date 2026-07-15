import { describe, expect, it } from "vitest";
import { buildMysqlExplainSql, mysqlPlanLines } from "../src/query/explain.js";

describe("MySQL EXPLAIN construction (F128)", () => {
  it("builds a tree plan without retaining a trailing semicolon", () => {
    expect(buildMysqlExplainSql("SELECT 1;")).toBe("EXPLAIN FORMAT=TREE SELECT 1");
  });

  it("normalizes the multiline tree cell", () => {
    expect(mysqlPlanLines([{ EXPLAIN: "-> Rows fetched\n    -> Table scan" }])).toEqual([
      "-> Rows fetched",
      "    -> Table scan"
    ]);
  });
});
