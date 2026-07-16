import { describe, expect, it } from "vitest";
import { buildFilterClause } from "../../src/query/sql.js";

describe("MySQL structured filters", () => {
  it("uses JSON_CONTAINS with a bound JSON candidate", () => {
    expect(
      buildFilterClause([
        { column: "payload", op: "contains", value: '["one"]', columnDataType: "json" }
      ])
    ).toEqual({
      clause: " WHERE JSON_CONTAINS(`payload`, CAST(? AS JSON))",
      params: ['["one"]']
    });
  });
});
