import { describe, expect, it } from "vitest";
import {
  classifyExplainTarget,
  classifyStatement,
  ReadOnlyViolationError
} from "../src/read-only.js";

describe("classifyStatement", () => {
  it("classifies SELECT and other read-leading keywords as read", () => {
    expect(classifyStatement("SELECT * FROM users")).toBe("read");
    expect(classifyStatement("EXPLAIN SELECT 1")).toBe("read");
    expect(classifyStatement("SHOW TABLES")).toBe("read");
    expect(classifyStatement("TABLE users")).toBe("read");
    expect(classifyStatement("VALUES (1, 2)")).toBe("read");
  });

  it("classifies a non-writable CTE as read", () => {
    expect(classifyStatement("WITH t AS (SELECT 1) SELECT * FROM t")).toBe("read");
  });

  it("ignores leading comments when classifying", () => {
    expect(classifyStatement("-- a comment\nSELECT 1")).toBe("read");
  });

  it("classifies INSERT as mutation", () => {
    expect(classifyStatement("INSERT INTO users (name) VALUES ('x')")).toBe("mutation");
  });

  it("classifies UPDATE/DELETE with a WHERE clause as mutation", () => {
    expect(classifyStatement("UPDATE users SET name = 'x' WHERE id = 1")).toBe("mutation");
    expect(classifyStatement("DELETE FROM users WHERE id = 1")).toBe("mutation");
  });

  it("classifies UPDATE/DELETE without a WHERE clause as destructive", () => {
    expect(classifyStatement("UPDATE users SET name = 'x'")).toBe("destructive");
    expect(classifyStatement("DELETE FROM users")).toBe("destructive");
  });

  it("classifies DROP and TRUNCATE as destructive regardless of any WHERE-like text", () => {
    expect(classifyStatement("DROP TABLE users")).toBe("destructive");
    expect(classifyStatement("TRUNCATE users")).toBe("destructive");
  });

  it("classifies CREATE, ALTER, GRANT, REVOKE, COMMENT as ddl", () => {
    expect(classifyStatement("CREATE TABLE users (id int)")).toBe("ddl");
    expect(classifyStatement("ALTER TABLE users ADD COLUMN x int")).toBe("ddl");
    expect(classifyStatement("GRANT ALL ON users TO public")).toBe("ddl");
    expect(classifyStatement("REVOKE ALL ON users FROM public")).toBe("ddl");
    expect(classifyStatement("COMMENT ON TABLE users IS 'x'")).toBe("ddl");
  });

  it("classifies MERGE, COPY, CALL, DO, VACUUM, REINDEX, REFRESH, LOCK as mutation", () => {
    expect(
      classifyStatement(
        "MERGE INTO users USING x ON true WHEN NOT MATCHED THEN INSERT (id) VALUES (x.id)"
      )
    ).toBe("mutation");
    expect(classifyStatement("COPY users TO STDOUT")).toBe("mutation");
    expect(classifyStatement("CALL some_procedure()")).toBe("mutation");
    expect(classifyStatement("DO $$ BEGIN END $$")).toBe("mutation");
    expect(classifyStatement("VACUUM users")).toBe("mutation");
    expect(classifyStatement("REINDEX TABLE users")).toBe("mutation");
    expect(classifyStatement("REFRESH MATERIALIZED VIEW users_view")).toBe("mutation");
    expect(classifyStatement("LOCK TABLE users")).toBe("mutation");
  });

  it("classifies a writable CTE by its inner write action, even though it starts with WITH", () => {
    expect(
      classifyStatement(
        "WITH inserted AS (INSERT INTO users (name) VALUES ('x') RETURNING *) SELECT * FROM inserted"
      )
    ).toBe("mutation");
    expect(
      classifyStatement(
        "WITH deleted AS (DELETE FROM users WHERE id = 1 RETURNING *) SELECT * FROM deleted"
      )
    ).toBe("mutation");
    expect(
      classifyStatement("WITH deleted AS (DELETE FROM users RETURNING *) SELECT * FROM deleted")
    ).toBe("destructive");
  });

  it("conservatively classifies an unrecognized statement as mutation, not read", () => {
    expect(classifyStatement("PRAGMA foreign_keys = ON")).toBe("mutation");
  });

  it("does not false-positive on column/table names containing forbidden words as substrings", () => {
    expect(classifyStatement("SELECT created_at, call_count FROM audit_log")).toBe("read");
  });

  it("does not false-positive on a string literal containing a forbidden word", () => {
    expect(classifyStatement("SELECT * FROM logs WHERE action = 'update'")).toBe("read");
  });

  it("does not false-positive on a quoted identifier containing a forbidden word", () => {
    expect(classifyStatement('SELECT "update" FROM settings')).toBe("read");
  });

  it("throws on an empty query", () => {
    expect(() => classifyStatement("   ")).toThrow(ReadOnlyViolationError);
  });

  it("throws on multiple statements", () => {
    expect(() => classifyStatement("SELECT 1; DROP TABLE users")).toThrow(ReadOnlyViolationError);
  });

  it("does not false-positive on a string literal containing a semicolon", () => {
    expect(classifyStatement("SELECT 'a;b' AS x")).toBe("read");
  });
});

describe("classifyExplainTarget", () => {
  it("allows a plain plan for every single-statement classification", () => {
    expect(classifyExplainTarget("SELECT 1", false)).toBe("read");
    expect(classifyExplainTarget("DELETE FROM users WHERE id = 1", false)).toBe("mutation");
    expect(classifyExplainTarget("DROP TABLE users", false)).toBe("destructive");
  });

  it("allows ANALYZE only for read-classified SQL", () => {
    expect(classifyExplainTarget("SELECT 1", true)).toBe("read");
    expect(() => classifyExplainTarget("DELETE FROM users WHERE id = 1", true)).toThrow(
      ReadOnlyViolationError
    );
  });
});
