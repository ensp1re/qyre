import { describe, expect, it } from "vitest";
import { classifySqlitePermissionDenied } from "../src/access/permission-errors.js";

describe("classifySqlitePermissionDenied", () => {
  it("classifies read-only and authorization result codes", () => {
    expect(classifySqlitePermissionDenied({ code: "SQLITE_READONLY" })).toBe("read-only");
    expect(classifySqlitePermissionDenied({ code: "SQLITE_READONLY_DBMOVED" })).toBe("read-only");
    expect(classifySqlitePermissionDenied({ code: "SQLITE_AUTH" })).toBe("permission");
  });

  it("does not misclassify unrelated failures", () => {
    expect(classifySqlitePermissionDenied({ code: "SQLITE_CONSTRAINT_UNIQUE" })).toBeUndefined();
  });
});
