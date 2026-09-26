import { describe, expect, it } from "vitest";
import { maskSql, scanSql, sqlLexModes } from "../src/query/sql-lexer.js";
import type { SqlDialect, SqlLexMode } from "../src/query/sql-lexer.js";

const kinds = (sql: string, dialect: SqlDialect, mode?: SqlLexMode) =>
  scanSql(sql, dialect, mode).map((segment) => [
    segment.kind,
    sql.slice(segment.start, segment.end)
  ]);

describe("scanSql", () => {
  it("treats comment markers inside literals as literal text", () => {
    expect(kinds("SELECT '/*', '--' -- c", "postgres")).toEqual([
      ["code", "SELECT "],
      ["string", "'/*'"],
      ["code", ", "],
      ["string", "'--'"],
      ["code", " "],
      ["comment", "-- c"]
    ]);
  });

  it("treats quotes inside comments as comment text", () => {
    expect(kinds("SELECT 1 /* it's */ -- \"x\n", "postgres")).toEqual([
      ["code", "SELECT 1 "],
      ["comment", "/* it's */"],
      ["code", " "],
      ["comment", '-- "x'],
      ["code", "\n"]
    ]);
  });

  it("lexes Postgres dollar quotes, E'' escapes, and nested comments", () => {
    expect(kinds("SELECT $a$ ' $a$, E'\\'', a$b$c", "postgres")).toEqual([
      ["code", "SELECT "],
      ["string", "$a$ ' $a$"],
      ["code", ", "],
      ["string", "E'\\''"],
      ["code", ", a$b$c"]
    ]);
    expect(kinds("/* a /* b */ c */x", "postgres")).toEqual([
      ["comment", "/* a /* b */ c */"],
      ["code", "x"]
    ]);
  });

  it("lexes MySQL backslash escapes, # comments, and executable comments", () => {
    expect(kinds("SELECT 'a\\'b', `c``d` # e", "mysql")).toEqual([
      ["code", "SELECT "],
      ["string", "'a\\'b'"],
      ["code", ", "],
      ["identifier", "`c``d`"],
      ["code", " "],
      ["comment", "# e"]
    ]);
    expect(kinds("SELECT 1 /*!50000 INTO OUTFILE 'x' */", "mysql")).toEqual([
      ["code", "SELECT 1 "],
      ["comment", "/*!50000"],
      ["code", " INTO OUTFILE "],
      ["string", "'x'"],
      ["code", " "],
      ["comment", "*/"]
    ]);
    expect(kinds("SELECT 1--1", "mysql")).toEqual([["code", "SELECT 1--1"]]);
  });

  it("lexes MySQL NO_BACKSLASH_ESCAPES and ANSI_QUOTES modes and MariaDB executable comments", () => {
    const [, noBackslash, ansi] = sqlLexModes("mysql");
    expect(kinds("SELECT 'a\\' -- '", "mysql", noBackslash)).toEqual([
      ["code", "SELECT "],
      ["string", "'a\\'"],
      ["code", " "],
      ["comment", "-- '"]
    ]);
    expect(kinds('SELECT "a\\" -- "', "mysql", ansi)).toEqual([
      ["code", "SELECT "],
      ["identifier", '"a\\"'],
      ["code", " "],
      ["comment", '-- "']
    ]);
    expect(kinds("SELECT 1 /*M!100000 , 2 */", "mysql")).toEqual([
      ["code", "SELECT 1 "],
      ["comment", "/*M!100000"],
      ["code", " , 2 "],
      ["comment", "*/"]
    ]);
    expect(sqlLexModes("postgres")).toHaveLength(1);
  });

  it("lexes SQLite bracket identifiers", () => {
    expect(kinds("SELECT [a';b] FROM t", "sqlite")).toEqual([
      ["code", "SELECT "],
      ["identifier", "[a';b]"],
      ["code", " FROM t"]
    ]);
  });

  it("extends an unterminated literal or comment to the end of the input", () => {
    expect(kinds("SELECT 'abc; DROP", "postgres")).toEqual([
      ["code", "SELECT "],
      ["string", "'abc; DROP"]
    ]);
  });
});

describe("maskSql", () => {
  it("preserves offsets while blanking the chosen segment kinds", () => {
    const sql = "SELECT 'x' -- c\nFROM t";
    const masked = maskSql(sql, "postgres", ["comment"]);
    expect(masked).toBe("SELECT 'x'     \nFROM t");
    expect(masked).toHaveLength(sql.length);
  });
});
