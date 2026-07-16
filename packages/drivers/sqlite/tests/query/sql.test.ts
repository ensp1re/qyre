import { describe, expect, it } from "vitest";
import { buildFilterClause } from "../../src/query/sql.js";

describe("SQLite row search", () => {
  it("casts JSON and scalar columns to searchable text", () => {
    expect(
      buildFilterClause(undefined, {
        value: "needle",
        columns: [
          {
            name: "name",
            dataType: "TEXT",
            nullable: false,
            isPrimaryKey: false,
            isForeignKey: false
          },
          {
            name: "payload",
            dataType: "JSON",
            nullable: false,
            isPrimaryKey: false,
            isForeignKey: false
          }
        ]
      })
    ).toEqual({
      clause:
        " WHERE (CAST(\"name\" AS TEXT) LIKE ? ESCAPE '\\' OR CAST(\"payload\" AS TEXT) LIKE ? ESCAPE '\\')",
      params: ["%needle%", "%needle%"]
    });
  });
});
