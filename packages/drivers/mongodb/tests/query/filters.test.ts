import { describe, expect, it } from "vitest";
import { buildMongoFilter } from "../../src/query/filters.js";

const columns = [
  {
    name: "profile",
    dataType: "object",
    nullable: false,
    isPrimaryKey: false,
    isForeignKey: false
  },
  {
    name: "tags",
    dataType: "array",
    nullable: false,
    isPrimaryKey: false,
    isForeignKey: false
  }
] as const;

describe("MongoDB structured filters", () => {
  it("builds native recursive text matching for object keys, values, and array members", () => {
    const filter = buildMongoFilter(
      [
        {
          column: "profile",
          op: "contains",
          value: "role",
          columnDataType: "object"
        },
        {
          column: "tags",
          op: "contains",
          value: "one",
          columnDataType: "array"
        }
      ],
      columns
    );
    const serialized = JSON.stringify(filter);
    expect(serialized).toContain("$objectToArray");
    expect(serialized).toContain("$anyElementTrue");
    expect(serialized).toContain('"regex":"role"');
    expect(serialized).toContain('"regex":"one"');
    expect(serialized).not.toContain("$function");
  });

  it("searches every non-binary column with the same recursive expression", () => {
    const serialized = JSON.stringify(
      buildMongoFilter(undefined, columns, { value: "needle", columns })
    );
    expect(serialized).toContain('"$or"');
    expect(serialized.match(/"regex":"needle"/g)?.length).toBeGreaterThan(1);
  });
});
