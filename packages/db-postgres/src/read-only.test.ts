import { describe, expect, it } from "vitest";
import { assertReadOnly, ReadOnlyViolationError } from "./read-only.js";

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
});
