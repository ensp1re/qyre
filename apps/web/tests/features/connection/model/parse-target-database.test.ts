import { describe, expect, it } from "vitest";
import { parseTargetDatabase } from "../../../../src/features/connection/model/targets/parse-target-database.js";

describe("parseTargetDatabase (F116)", () => {
  it("extracts the database name from a redacted postgres target", () => {
    expect(parseTargetDatabase("postgres://user:***@localhost:5432/mydb")).toBe("mydb");
  });

  it("decodes a percent-encoded database name", () => {
    expect(parseTargetDatabase("postgres://user:***@localhost:5432/my%20db")).toBe("my db");
  });

  it("returns undefined for a target with no database segment", () => {
    expect(parseTargetDatabase("postgres://user:***@localhost:5432/")).toBeUndefined();
    expect(parseTargetDatabase("postgres://user:***@localhost:5432")).toBeUndefined();
  });

  it("returns undefined for a non-URL target (SQLite's raw file path)", () => {
    expect(parseTargetDatabase("./app.db")).toBeUndefined();
  });

  it("returns undefined when nothing is connected", () => {
    expect(parseTargetDatabase(null)).toBeUndefined();
    expect(parseTargetDatabase(undefined)).toBeUndefined();
  });
});
