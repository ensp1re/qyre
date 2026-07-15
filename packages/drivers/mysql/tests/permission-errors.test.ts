import { describe, expect, it } from "vitest";
import { classifyMysqlPermissionDenied } from "../src/access/permission-errors.js";

describe("classifyMysqlPermissionDenied", () => {
  it("classifies symbolic and numeric access denials plus read-only sessions", () => {
    expect(classifyMysqlPermissionDenied({ code: "ER_TABLEACCESS_DENIED_ERROR" })).toBe(
      "permission"
    );
    expect(classifyMysqlPermissionDenied({ errno: 1227 })).toBe("permission");
    expect(classifyMysqlPermissionDenied({ code: "ER_OPTION_PREVENTS_STATEMENT" })).toBe(
      "read-only"
    );
  });

  it("does not misclassify unrelated failures", () => {
    expect(classifyMysqlPermissionDenied({ code: "ER_DUP_ENTRY", errno: 1062 })).toBeUndefined();
    expect(classifyMysqlPermissionDenied(new Error("access denied"))).toBeUndefined();
  });
});
