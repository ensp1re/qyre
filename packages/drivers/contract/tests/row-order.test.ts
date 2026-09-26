import { describe, expect, it } from "vitest";
import { buildOrderByClause, resolveRowOrder } from "../src/query/row-order.js";

const quote = (name: string) => `"${name}"`;

describe("resolveRowOrder", () => {
  it("orders by the key when there is no user sort", () => {
    expect(resolveRowOrder(undefined, ["a", "b"])).toEqual([
      { column: "a", direction: "asc" },
      { column: "b", direction: "asc" }
    ]);
  });

  it("appends key columns the user sort does not already cover", () => {
    expect(resolveRowOrder({ column: "b", direction: "desc" }, ["a", "b"])).toEqual([
      { column: "b", direction: "desc" },
      { column: "a", direction: "asc" }
    ]);
  });

  it("keeps only the user sort for a keyless table", () => {
    expect(resolveRowOrder({ column: "n", direction: "asc" }, [])).toEqual([
      { column: "n", direction: "asc" }
    ]);
    expect(resolveRowOrder(undefined, [])).toEqual([]);
  });
});

describe("buildOrderByClause", () => {
  it("renders nothing for an empty order and quoted columns otherwise", () => {
    expect(buildOrderByClause([], quote)).toBe("");
    expect(
      buildOrderByClause(
        [
          { column: "n", direction: "desc" },
          { column: "id", direction: "asc" }
        ],
        quote
      )
    ).toBe(' ORDER BY "n" DESC, "id" ASC');
  });
});
