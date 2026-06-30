import { describe, expect, it } from "vitest";
import { parseArgs } from "./index.js";

describe("parseArgs", () => {
  it("parses a target argument", () => {
    expect(parseArgs(["postgres://localhost/db"]).target).toBe("postgres://localhost/db");
  });

  it("parses the port option", () => {
    const args = parseArgs(["postgres://localhost/db", "--port", "9000"]);
    expect(args.port).toBe(9000);
  });

  it("returns an undefined target when none is given", () => {
    expect(parseArgs([]).target).toBeUndefined();
  });
});
