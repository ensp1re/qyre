import { describe, expect, it } from "vitest";
import { buildFilterClause } from "../../src/query/sql.js";

describe("PostgreSQL structured filters", () => {
  it("uses JSON containment for JSON/JSONB columns", () => {
    expect(
      buildFilterClause([
        {
          column: "payload",
          op: "contains",
          value: '{"role":"admin"}',
          columnDataType: "jsonb"
        }
      ])
    ).toEqual({
      clause: ' WHERE "payload"::jsonb @> $1::jsonb',
      params: ['{"role":"admin"}']
    });
  });

  it("uses native array containment with a parsed array parameter", () => {
    expect(
      buildFilterClause([
        { column: "tags", op: "contains", value: '["one"]', columnDataType: "ARRAY" }
      ])
    ).toEqual({ clause: ' WHERE "tags" @> $1', params: [["one"]] });
  });
});
