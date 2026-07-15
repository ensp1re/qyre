import { describe, expect, it } from "vitest";
import { classifyPostgresPermissionDenied } from "../src/access/permission-errors.js";

describe("classifyPostgresPermissionDenied", () => {
  it("classifies insufficient privilege, ownership, and read-only SQLSTATEs", () => {
    expect(classifyPostgresPermissionDenied({ code: "42501", message: "permission denied" })).toBe(
      "permission"
    );
    expect(
      classifyPostgresPermissionDenied({ code: "42501", message: "must be owner of table users" })
    ).toBe("ownership");
    expect(classifyPostgresPermissionDenied({ code: "25006" })).toBe("read-only");
  });

  it("does not misclassify unrelated failures", () => {
    expect(classifyPostgresPermissionDenied({ code: "23505" })).toBeUndefined();
    expect(classifyPostgresPermissionDenied(new Error("permission denied"))).toBeUndefined();
  });
});
