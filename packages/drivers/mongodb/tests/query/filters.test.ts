import { Decimal128, Long, ObjectId } from "mongodb";
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

function firstCondition(filter: Record<string, unknown>): Record<string, unknown> {
  return (filter.$and as Record<string, unknown>[])[0]!;
}

describe("MongoDB typed scalar filters", () => {
  const field = (name: string, dataType: string) => ({
    name,
    dataType,
    nullable: true,
    isPrimaryKey: false,
    isForeignKey: false
  });

  it("uses the server-resolved column type instead of the local column sample", () => {
    const filter = buildMongoFilter(
      [{ column: "score", op: "gt", value: "5", columnDataType: "number" }],
      [field("score", "string")]
    );
    expect(filter).toEqual({ $and: [{ score: { $gt: 5 } }] });
  });

  it("matches hex text in a mixed-type _id as either an ObjectId or the literal string", () => {
    const hex = "507f1f77bcf86cd799439011";
    expect(
      buildMongoFilter([{ column: "_id", op: "eq", value: hex, columnDataType: "mixed" }], [])
    ).toEqual({ $and: [{ _id: { $in: [new ObjectId(hex), hex] } }] });
    expect(
      buildMongoFilter([{ column: "_id", op: "neq", value: hex, columnDataType: "mixed" }], [])
    ).toEqual({ $and: [{ _id: { $nin: [new ObjectId(hex), hex] } }] });
    expect(
      buildMongoFilter([{ column: "_id", op: "eq", value: "abc", columnDataType: "mixed" }], [])
    ).toEqual({ $and: [{ _id: { $eq: "abc" } }] });
  });

  it("matches decimal text against both Double and Decimal128 values", () => {
    const condition = firstCondition(
      buildMongoFilter([{ column: "price", op: "eq", value: "0.1", columnDataType: "number" }], [])
    ) as { price: { $in: unknown[] } };
    const operands = condition.price.$in;
    expect(operands[0]).toBe(0.1);
    expect(operands[1]).toBeInstanceOf(Decimal128);
    expect(String(operands[1])).toBe("0.1");
  });

  it("keeps both representations on the correct side of range comparisons", () => {
    const conditionFor = (op: "lt" | "lte" | "gt" | "gte" | "neq") =>
      firstCondition(
        buildMongoFilter([{ column: "price", op, value: "0.1", columnDataType: "number" }], [])
      );
    expect(Object.keys(conditionFor("lt"))).toEqual(["$and"]);
    expect(Object.keys(conditionFor("gt"))).toEqual(["$and"]);
    expect(Object.keys(conditionFor("lte"))).toEqual(["$or"]);
    expect(Object.keys(conditionFor("gte"))).toEqual(["$or"]);
    expect(Object.keys((conditionFor("neq") as { price: object }).price)).toEqual(["$nin"]);
  });

  it("compares integers beyond 2^53 as exact 64-bit integers", () => {
    const condition = firstCondition(
      buildMongoFilter(
        [{ column: "n", op: "eq", value: "9007199254740993", columnDataType: "number" }],
        []
      )
    ) as { n: { $eq: unknown } };
    expect(condition.n.$eq).toBeInstanceOf(Long);
    expect(String(condition.n.$eq)).toBe("9007199254740993");
  });

  it.each(["", "  ", "abc", "0x10", "1,000"])(
    "rejects non-numeric number filter text %j",
    (value) => {
      expect(() =>
        buildMongoFilter([{ column: "n", op: "eq", value, columnDataType: "number" }], [])
      ).toThrow(expect.objectContaining({ statusCode: 400 }));
    }
  );

  it("reads zone-less datetime filters as UTC, matching the grid's UTC display", () => {
    const condition = firstCondition(
      buildMongoFilter(
        [{ column: "at", op: "gte", value: "2024-01-01T10:00", columnDataType: "date" }],
        []
      )
    ) as { at: { $gte: Date } };
    expect(condition.at.$gte.toISOString()).toBe("2024-01-01T10:00:00.000Z");
  });

  it("rejects date filter text that is not an exact instant", () => {
    expect(() =>
      buildMongoFilter([{ column: "at", op: "eq", value: "soon", columnDataType: "date" }], [])
    ).toThrow(expect.objectContaining({ statusCode: 400 }));
  });
});
