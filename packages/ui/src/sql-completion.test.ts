import { describe, expect, it } from "vitest";
import { isTableNamePosition, matchKeywords, matchTableNames } from "./sql-completion.js";

describe("isTableNamePosition", () => {
  it("is true right after FROM/JOIN, case-insensitively", () => {
    expect(isTableNamePosition("SELECT * FROM ")).toBe(true);
    expect(isTableNamePosition("select * from ")).toBe(true);
    expect(isTableNamePosition("SELECT * FROM qy")).toBe(true);
    expect(isTableNamePosition("SELECT * JOIN ")).toBe(true);
  });

  it("is false everywhere else", () => {
    expect(isTableNamePosition("SE")).toBe(false);
    expect(isTableNamePosition("SELECT * WHE")).toBe(false);
    expect(isTableNamePosition("SELECT * FROM users WHERE ")).toBe(false);
  });
});

describe("matchKeywords", () => {
  it("returns all keywords for an empty prefix", () => {
    expect(matchKeywords("")).toContain("SELECT");
    expect(matchKeywords("")).toContain("WHERE");
  });

  it("filters case-insensitively by prefix", () => {
    expect(matchKeywords("SE")).toEqual(["SELECT"]);
    expect(matchKeywords("whe")).toEqual(["WHERE"]);
  });

  it("never offers write-shaped keywords", () => {
    expect(matchKeywords("INSERT")).toEqual([]);
    expect(matchKeywords("DELETE")).toEqual([]);
    expect(matchKeywords("UPDATE")).toEqual([]);
  });
});

describe("matchTableNames", () => {
  const tables = ["qyre_demo_users", "orders", "order_items"];

  it("returns all tables for an empty prefix", () => {
    expect(matchTableNames("", tables)).toEqual(tables);
  });

  it("filters case-insensitively by prefix", () => {
    expect(matchTableNames("qy", tables)).toEqual(["qyre_demo_users"]);
    expect(matchTableNames("order", tables)).toEqual(["orders", "order_items"]);
  });

  it("returns nothing when no table matches", () => {
    expect(matchTableNames("zzz", tables)).toEqual([]);
  });
});
