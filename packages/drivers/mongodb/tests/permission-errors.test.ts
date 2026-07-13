import { describe, expect, it } from "vitest";
import { classifyMongodbPermissionDenied } from "../src/permission-errors.js";

describe("classifyMongodbPermissionDenied", () => {
  it("classifies native and wrapped unauthorized errors", () => {
    expect(classifyMongodbPermissionDenied({ code: 13 })).toBe("permission");
    expect(classifyMongodbPermissionDenied({ codeName: "Unauthorized" })).toBe("permission");
    expect(
      classifyMongodbPermissionDenied({
        name: "MongoServerError",
        message: "not authorized on qyre_test"
      })
    ).toBe("permission");
  });

  it("does not misclassify unrelated failures or message-only plain errors", () => {
    expect(classifyMongodbPermissionDenied({ code: 11000 })).toBeUndefined();
    expect(classifyMongodbPermissionDenied(new Error("not authorized"))).toBeUndefined();
  });
});
