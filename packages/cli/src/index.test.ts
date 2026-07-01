import { describe, expect, it } from "vitest";
import { parseArgs, resolvePort } from "./index.js";

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

describe("resolvePort", () => {
  it("prefers the --port flag over HUMB_PORT", () => {
    expect(resolvePort(9000, { HUMB_PORT: "8000" })).toBe(9000);
  });

  it("falls back to HUMB_PORT when no flag is given", () => {
    expect(resolvePort(undefined, { HUMB_PORT: "8000" })).toBe(8000);
  });

  it("returns undefined when neither is set", () => {
    expect(resolvePort(undefined, {})).toBeUndefined();
  });

  it("ignores an invalid HUMB_PORT", () => {
    expect(resolvePort(undefined, { HUMB_PORT: "not-a-number" })).toBeUndefined();
  });
});
