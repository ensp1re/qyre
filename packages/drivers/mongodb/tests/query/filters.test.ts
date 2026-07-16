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
  it("matches partial object fields and required array members", () => {
    expect(
      buildMongoFilter(
        [
          {
            column: "profile",
            op: "contains",
            value: '{"role":"admin"}',
            columnDataType: "object"
          },
          {
            column: "tags",
            op: "contains",
            value: '["one","two"]',
            columnDataType: "array"
          }
        ],
        columns
      )
    ).toEqual({
      $and: [{ $and: [{ "profile.role": "admin" }] }, { tags: { $all: ["one", "two"] } }]
    });
  });
});
