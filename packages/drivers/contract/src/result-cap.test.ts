import { describe, expect, it } from "vitest";
import { capResultRows } from "./result-cap.js";

describe("capResultRows", () => {
  it("wraps a SELECT in an outer LIMIT", () => {
    expect(capResultRows("SELECT * FROM users", 1000)).toBe(
      "SELECT * FROM (SELECT * FROM users) AS humb_capped_query LIMIT 1000"
    );
  });

  it("strips a trailing semicolon before wrapping", () => {
    expect(capResultRows("SELECT * FROM users;", 1000)).toBe(
      "SELECT * FROM (SELECT * FROM users) AS humb_capped_query LIMIT 1000"
    );
  });

  it("wraps WITH/VALUES/TABLE the same way", () => {
    expect(capResultRows("WITH x AS (SELECT 1) SELECT * FROM x", 5)).toBe(
      "SELECT * FROM (WITH x AS (SELECT 1) SELECT * FROM x) AS humb_capped_query LIMIT 5"
    );
    expect(capResultRows("VALUES (1), (2)", 5)).toBe(
      "SELECT * FROM (VALUES (1), (2)) AS humb_capped_query LIMIT 5"
    );
    expect(capResultRows("TABLE users", 5)).toBe(
      "SELECT * FROM (TABLE users) AS humb_capped_query LIMIT 5"
    );
  });

  it("leaves EXPLAIN and SHOW untouched - not valid subquery sources and not the unbounded-rows risk", () => {
    expect(capResultRows("EXPLAIN SELECT * FROM users", 5)).toBe("EXPLAIN SELECT * FROM users");
    expect(capResultRows("SHOW TABLES", 5)).toBe("SHOW TABLES");
  });

  it("defaults to MAX_QUERY_RESULT_ROWS when no limit is given", () => {
    expect(capResultRows("SELECT 1")).toContain("LIMIT 1000");
  });
});
