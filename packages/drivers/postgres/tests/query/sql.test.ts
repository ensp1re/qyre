import { describe, expect, it } from "vitest";
import { buildFilterClause } from "../../src/query/sql.js";

describe("PostgreSQL structured filters", () => {
  it("searches JSON/JSONB display text without requiring a JSON candidate", () => {
    expect(
      buildFilterClause([
        {
          column: "payload",
          op: "contains",
          value: "admin",
          columnDataType: "jsonb"
        }
      ])
    ).toEqual({
      clause: " WHERE \"payload\"::text ILIKE $1 ESCAPE '\\'",
      params: ["%admin%"]
    });
  });

  it("searches native array display text with a plain value", () => {
    expect(
      buildFilterClause([{ column: "tags", op: "contains", value: "one", columnDataType: "ARRAY" }])
    ).toEqual({ clause: " WHERE \"tags\"::text ILIKE $1 ESCAPE '\\'", params: ["%one%"] });
  });
});
