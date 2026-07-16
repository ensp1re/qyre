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

  it("parameterizes whole-table search and skips binary columns", () => {
    expect(
      buildFilterClause(undefined, {
        value: "admin",
        columns: [
          {
            name: "name",
            dataType: "varchar",
            nullable: false,
            isPrimaryKey: false,
            isForeignKey: false
          },
          {
            name: "blob",
            dataType: "blob",
            nullable: false,
            isPrimaryKey: false,
            isForeignKey: false
          }
        ]
      })
    ).toEqual({
      clause: " WHERE (CAST(`name` AS CHAR) LIKE ? ESCAPE '\\\\')",
      params: ["%admin%"]
    });
  });
});
