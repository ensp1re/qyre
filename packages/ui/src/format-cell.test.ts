import { describe, expect, it } from "vitest";
import { isDateType } from "./format-cell.js";

describe("isDateType", () => {
  it("recognizes Postgres date/timestamp type names, case-insensitively", () => {
    expect(isDateType("timestamp with time zone")).toBe(true);
    expect(isDateType("timestamp without time zone")).toBe(true);
    expect(isDateType("DATE")).toBe(true);
    expect(isDateType("time")).toBe(true);
  });

  it("recognizes SQLite's raw declared date-ish types", () => {
    expect(isDateType("DATETIME")).toBe(true);
  });

  it("rejects non-date types, including near-miss prefixes", () => {
    expect(isDateType("text")).toBe(false);
    expect(isDateType("integer")).toBe(false);
    expect(isDateType("boolean")).toBe(false);
    expect(isDateType("any")).toBe(false);
    expect(isDateType("uuid")).toBe(false);
  });
});
