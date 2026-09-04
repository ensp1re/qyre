import { describe, expect, it } from "vitest";
import { assertReadOnly, ReadOnlyViolationError } from "../src/safety/read-only.js";

describe("assertReadOnly", () => {
  it("allows SELECT", () => {
    expect(() => assertReadOnly("SELECT * FROM users")).not.toThrow();
  });

  it("allows a CTE (WITH)", () => {
    expect(() => assertReadOnly("WITH t AS (SELECT 1) SELECT * FROM t")).not.toThrow();
  });

  it("ignores leading comments", () => {
    expect(() => assertReadOnly("-- a comment\nSELECT 1")).not.toThrow();
  });

  it("rejects INSERT", () => {
    expect(() => assertReadOnly("INSERT INTO users VALUES (1)")).toThrow(ReadOnlyViolationError);
  });

  it("rejects UPDATE", () => {
    expect(() => assertReadOnly("UPDATE users SET name = 'x'")).toThrow(ReadOnlyViolationError);
  });

  it("rejects DROP", () => {
    expect(() => assertReadOnly("DROP TABLE users")).toThrow(ReadOnlyViolationError);
  });

  it("rejects multiple statements", () => {
    expect(() => assertReadOnly("SELECT 1; DROP TABLE users")).toThrow(ReadOnlyViolationError);
  });

  it("rejects an empty query", () => {
    expect(() => assertReadOnly("   ")).toThrow(ReadOnlyViolationError);
  });

  it("rejects a writable CTE (DELETE hidden behind a leading WITH)", () => {
    expect(() =>
      assertReadOnly("WITH deleted AS (DELETE FROM users RETURNING *) SELECT * FROM deleted")
    ).toThrow(ReadOnlyViolationError);
  });

  it("rejects a writable CTE using INSERT", () => {
    expect(() =>
      assertReadOnly(
        "WITH inserted AS (INSERT INTO users (name) VALUES ('x') RETURNING *) SELECT * FROM inserted"
      )
    ).toThrow(ReadOnlyViolationError);
  });

  it("rejects TRUNCATE, GRANT, and CALL even as the leading keyword", () => {
    expect(() => assertReadOnly("TRUNCATE users")).toThrow(ReadOnlyViolationError);
    expect(() => assertReadOnly("GRANT ALL ON users TO public")).toThrow(ReadOnlyViolationError);
    expect(() => assertReadOnly("CALL some_procedure()")).toThrow(ReadOnlyViolationError);
  });

  it("does not false-positive on column/table names containing forbidden words as substrings", () => {
    expect(() => assertReadOnly("SELECT created_at, call_count FROM audit_log")).not.toThrow();
  });

  it("does not false-positive on a string literal containing a forbidden word", () => {
    expect(() => assertReadOnly("SELECT * FROM logs WHERE action = 'update'")).not.toThrow();
  });

  it("does not false-positive on a quoted identifier containing a forbidden word", () => {
    expect(() => assertReadOnly('SELECT "update" FROM settings')).not.toThrow();
  });

  it("does not false-positive on a string literal containing a semicolon", () => {
    expect(() => assertReadOnly("SELECT 'a;b' AS x")).not.toThrow();
  });

  it("does not false-positive on a quoted identifier containing a semicolon", () => {
    expect(() => assertReadOnly('SELECT "a;b" FROM users')).not.toThrow();
  });

  it("still rejects two real statements separated by a semicolon outside any literal", () => {
    expect(() => assertReadOnly("SELECT 'a;b' AS x; DROP TABLE users")).toThrow(
      ReadOnlyViolationError
    );
  });

  it("still tolerates a single trailing semicolon after a string literal containing one", () => {
    expect(() => assertReadOnly("SELECT 'a;b' AS x;")).not.toThrow();
  });

  it("rejects SELECT ... INTO OUTFILE/DUMPFILE, which write a file on the database server", () => {
    expect(() =>
      assertReadOnly("SELECT * FROM users INTO OUTFILE '/var/lib/mysql-files/x.txt'")
    ).toThrow(ReadOnlyViolationError);
    expect(() => assertReadOnly("SELECT * FROM users INTO DUMPFILE '/tmp/x'")).toThrow(
      ReadOnlyViolationError
    );
  });

  it("rejects an OUTFILE write hidden behind a leading comment", () => {
    expect(() =>
      assertReadOnly("-- innocuous\nSELECT 1 INTO OUTFILE '/var/lib/mysql-files/x.txt'")
    ).toThrow(ReadOnlyViolationError);
  });

  it("does not false-positive on a column literally named outfile in a quoted identifier", () => {
    expect(() => assertReadOnly('SELECT "outfile" FROM users')).not.toThrow();
  });
});
