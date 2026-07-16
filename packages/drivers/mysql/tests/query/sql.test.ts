import { describe, expect, it } from "vitest";
import { buildFilterClause } from "../../src/query/sql.js";

describe("MySQL structured filters", () => {
  it("searches JSON display text without requiring a JSON candidate", () => {
    expect(
      buildFilterClause([
        { column: "payload", op: "contains", value: "one", columnDataType: "json" }
      ])
    ).toEqual({
      clause: " WHERE CAST(`payload` AS CHAR) LIKE ? ESCAPE '\\\\'",
      params: ["%one%"]
    });
  });
});
