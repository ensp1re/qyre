import { describe, expect, it } from "vitest";
import {
  classifyExplainTarget,
  classifyStatement,
  ReadOnlyViolationError
} from "../src/safety/read-only.js";

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

  it("rejects a second statement hidden behind a comment marker inside a string literal", () => {
    for (const sql of [
      "SELECT '/*'; COMMIT; DROP TABLE t; SELECT '*/'",
      "SELECT '--'; DELETE FROM t; SELECT 1",
      "SELECT \"/*\"; COMMIT; DROP TABLE t; SELECT '*/'"
    ]) {
      expect(() => classifyStatement(sql), sql).toThrow("Multiple statements");
      for (const dialect of ["postgres", "mysql", "sqlite"] as const) {
        expect(() => classifyStatement(sql, dialect), `${dialect}: ${sql}`).toThrow(
          "Multiple statements"
        );
      }
    }
    // Only Postgres treats $$ as a quote; elsewhere the -- really starts a comment.
    expect(() => classifyStatement("SELECT $$--$$; DELETE FROM t WHERE id = 1")).toThrow(
      "Multiple statements"
    );
    expect(() =>
      classifyStatement("SELECT $$--$$; DELETE FROM t WHERE id = 1", "postgres")
    ).toThrow("Multiple statements");
  });

  it("follows each dialect's escape rules when finding statement boundaries", () => {
    // Postgres E'' strings and MySQL strings treat backslash as an escape.
    expect(() => classifyStatement("SELECT E'\\'; DROP TABLE t; --'", "postgres")).not.toThrow();
    expect(() => classifyStatement("SELECT 'a\\'; DROP TABLE t; SELECT '1'", "postgres")).toThrow(
      "Multiple statements"
    );
    expect(classifyStatement("SELECT 'a\\';' AS x", "mysql")).toBe("read");
    expect(() => classifyStatement("SELECT 'a\\'; DROP TABLE t; SELECT '1'")).toThrow(
      "Multiple statements"
    );
    // Postgres block comments nest; MySQL runs the body of /*! ... */ comments.
    expect(classifyStatement("SELECT 1 /* a /* b */ ; */ AS x", "postgres")).toBe("read");
    expect(classifyStatement("SELECT 1 /*!50000 INTO OUTFILE '/tmp/x' */", "mysql")).toBe(
      "mutation"
    );
    expect(classifyStatement("SELECT 1 # ; DROP TABLE t\n", "mysql")).toBe("read");
    expect(() => classifyStatement("SELECT 1 # 2; DROP TABLE t", "postgres")).toThrow(
      "Multiple statements"
    );
  });

  it("classifies MySQL under every NO_BACKSLASH_ESCAPES and ANSI_QUOTES combination", () => {
    // NO_BACKSLASH_ESCAPES: the backslash does not escape, so INTO OUTFILE is code.
    expect(
      classifyStatement("SELECT 'x\\' INTO OUTFILE '/var/lib/mysql-files/p.txt' -- '", "mysql")
    ).toBe("mutation");
    // ANSI_QUOTES: "..." is an identifier without backslash escapes.
    expect(
      classifyStatement(
        'SELECT 1 AS "a\\" INTO OUTFILE \'/var/lib/mysql-files/p.txt\' -- "',
        "mysql"
      )
    ).toBe("mutation");
    expect(classifyStatement("SELECT 'a\\'b' AS x, \"c\" AS y", "mysql")).toBe("read");
    expect(classifyStatement("SELECT 'x\\' AS \"drop\" -- '", "mysql")).toBe("read");
    expect(classifyStatement('SELECT "a\\" AS b, 1 INTO DUMPFILE \'x\' -- "', "mysql")).toBe(
      "mutation"
    );
  });

  it("treats MariaDB /*M! ... */ bodies as executable SQL", () => {
    expect(classifyStatement("SELECT 1 /*M!100000 INTO OUTFILE '/tmp/x' */", "mysql")).toBe(
      "mutation"
    );
  });

  it("requires a WHERE at the UPDATE/DELETE statement's own level", () => {
    expect(classifyStatement("UPDATE t SET a = (SELECT b FROM u WHERE u.id = 1)")).toBe(
      "destructive"
    );
    expect(classifyStatement("WITH x AS (SELECT 1 WHERE true) DELETE FROM t")).toBe("destructive");
    expect(classifyStatement("DELETE FROM t WHERE id IN (SELECT id FROM u)")).toBe("mutation");
    expect(classifyStatement("UPDATE t SET a = s.b FROM (SELECT 1 AS b) s WHERE t.id = s.b")).toBe(
      "mutation"
    );
    expect(classifyStatement("DELETE FROM t -- WHERE id = 1")).toBe("destructive");
    expect(classifyStatement("WITH x AS (SELECT id FROM t ORDER BY key) DELETE FROM t")).toBe(
      "destructive"
    );
    expect(
      classifyStatement(
        "WITH a AS (DELETE FROM t RETURNING id), b AS (SELECT 1 WHERE true) TABLE a"
      )
    ).toBe("destructive");
    expect(classifyStatement("DELETE FROM t WHERE note = 'x' AND id = 1")).toBe("mutation");
  });

  it("does not treat UPDATE/DELETE clause keywords as unfiltered statements", () => {
    expect(classifyStatement("SELECT * FROM t WHERE id = 1 FOR UPDATE")).toBe("mutation");
    expect(
      classifyStatement("INSERT INTO t (id) VALUES (1) ON CONFLICT (id) DO UPDATE SET n = 2")
    ).toBe("mutation");
    expect(
      classifyStatement("INSERT INTO t (id) VALUES (1) ON DUPLICATE KEY UPDATE n = 2", "mysql")
    ).toBe("mutation");
    expect(classifyStatement("CREATE TABLE c (p int REFERENCES t ON DELETE CASCADE)")).toBe("ddl");
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
