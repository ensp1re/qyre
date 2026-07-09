import { describe, expect, it } from "vitest";
import {
  friendlyTypeLabel,
  isClickableDateType,
  isDateType
} from "../../src/primitives/format-cell.js";

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

describe("isClickableDateType", () => {
  it("accepts date and timestamp types, which have a date component new Date() can parse", () => {
    expect(isClickableDateType("date")).toBe(true);
    expect(isClickableDateType("DATE")).toBe(true);
    expect(isClickableDateType("timestamp with time zone")).toBe(true);
    expect(isClickableDateType("timestamp without time zone")).toBe(true);
    expect(isClickableDateType("datetime")).toBe(true);
  });

  it("rejects a bare TIME type, which has no date component to parse (F081)", () => {
    expect(isClickableDateType("time")).toBe(false);
    expect(isClickableDateType("time without time zone")).toBe(false);
    expect(isClickableDateType("TIME")).toBe(false);
  });

  it("rejects non-date types", () => {
    expect(isClickableDateType("text")).toBe(false);
    expect(isClickableDateType("integer")).toBe(false);
  });
});

describe("friendlyTypeLabel", () => {
  it("replaces verbose engine-reported timestamp/time/date type names with a clear label (F081)", () => {
    expect(friendlyTypeLabel("timestamp without time zone")).toBe("timestamp");
    expect(friendlyTypeLabel("timestamp with time zone")).toBe("timestamp (tz)");
    expect(friendlyTypeLabel("time without time zone")).toBe("time");
    expect(friendlyTypeLabel("datetime")).toBe("timestamp");
    expect(friendlyTypeLabel("date")).toBe("date");
  });

  it("leaves non-date types unchanged", () => {
    expect(friendlyTypeLabel("character varying")).toBe("character varying");
    expect(friendlyTypeLabel("integer")).toBe("integer");
  });
});
