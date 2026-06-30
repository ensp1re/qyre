import { describe, expect, it } from "vitest";
import {
  InvalidConnectionTargetError,
  parseConnectionTarget,
  redactConnectionString
} from "./index.js";

describe("parseConnectionTarget", () => {
  it("accepts postgres:// urls", () => {
    const target = parseConnectionTarget("postgres://user:pass@localhost:5432/mydb");
    expect(target.engine).toBe("postgres");
  });

  it("accepts postgresql:// urls", () => {
    const target = parseConnectionTarget("postgresql://localhost/mydb");
    expect(target.engine).toBe("postgres");
  });

  it("rejects an empty target", () => {
    expect(() => parseConnectionTarget("")).toThrow(InvalidConnectionTargetError);
  });

  it("rejects unparseable input", () => {
    expect(() => parseConnectionTarget("not a url")).toThrow(InvalidConnectionTargetError);
  });

  it("rejects unsupported protocols", () => {
    expect(() => parseConnectionTarget("mysql://localhost/db")).toThrow(
      InvalidConnectionTargetError
    );
  });
});

describe("redactConnectionString", () => {
  it("masks the password", () => {
    expect(redactConnectionString("postgres://user:secret@localhost:5432/db")).not.toContain(
      "secret"
    );
  });

  it("returns a mask for unparseable input", () => {
    expect(redactConnectionString("nope")).toBe("<unparseable connection string>");
  });
});
