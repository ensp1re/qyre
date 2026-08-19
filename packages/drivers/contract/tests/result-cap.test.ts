import { describe, expect, it } from "vitest";
import { capResultRows } from "../src/query/result-cap.js";

describe("capResultRows", () => {
  it("wraps a SELECT in an outer LIMIT", () => {
    expect(capResultRows("SELECT * FROM users", 1000)).toBe(
      "SELECT * FROM (SELECT * FROM users) AS qyre_capped_query LIMIT 1000"
    );
  });

  it("strips a trailing semicolon before wrapping", () => {
    expect(capResultRows("SELECT * FROM users;", 1000)).toBe(
      "SELECT * FROM (SELECT * FROM users) AS qyre_capped_query LIMIT 1000"
    );
  });

  it("wraps WITH/VALUES/TABLE the same way", () => {
    expect(capResultRows("WITH x AS (SELECT 1) SELECT * FROM x", 5)).toBe(
      "SELECT * FROM (WITH x AS (SELECT 1) SELECT * FROM x) AS qyre_capped_query LIMIT 5"
    );
    expect(capResultRows("VALUES (1), (2)", 5)).toBe(
      "SELECT * FROM (VALUES (1), (2)) AS qyre_capped_query LIMIT 5"
    );
    expect(capResultRows("TABLE users", 5)).toBe(
      "SELECT * FROM (TABLE users) AS qyre_capped_query LIMIT 5"
    );
  });

  it("leaves EXPLAIN and SHOW untouched - not valid subquery sources and not the unbounded-rows risk", () => {
    expect(capResultRows("EXPLAIN SELECT * FROM users", 5)).toBe("EXPLAIN SELECT * FROM users");
    expect(capResultRows("SHOW TABLES", 5)).toBe("SHOW TABLES");
  });

  it("defaults to MAX_QUERY_RESULT_ROWS when no limit is given", () => {
    expect(capResultRows("SELECT 1")).toContain("LIMIT 1000");
  });

  // F154: keyword detection used to run against raw SQL, so a leading comment read as the first
  // keyword and the cap silently did not apply - an unbounded scan, and on MySQL the skipped
  // wrapper was also all that incidentally blocked `SELECT ... INTO OUTFILE`.
  it("still caps when a comment precedes the leading keyword", () => {
    expect(capResultRows("-- note\nSELECT * FROM users", 5)).toBe(
      "SELECT * FROM (-- note\nSELECT * FROM users) AS qyre_capped_query LIMIT 5"
    );
    expect(capResultRows("/* note */ SELECT * FROM users", 5)).toBe(
      "SELECT * FROM (/* note */ SELECT * FROM users) AS qyre_capped_query LIMIT 5"
    );
    expect(capResultRows("  --x\n  SELECT * FROM users", 5)).toContain("LIMIT 5");
  });

  it("keeps ignoring a commented EXPLAIN/SHOW, which a comment must not turn into a wrap", () => {
    expect(capResultRows("-- note\nEXPLAIN SELECT 1", 5)).toBe("-- note\nEXPLAIN SELECT 1");
    expect(capResultRows("/* note */ SHOW TABLES", 5)).toBe("/* note */ SHOW TABLES");
  });
});
