import { describe, expect, it } from "vitest";
import { keyRowsByColumn, uniqueColumnNames } from "../src/query/result-columns.js";

describe("uniqueColumnNames", () => {
  it("keeps unique names and suffixes repeats deterministically", () => {
    expect(uniqueColumnNames(["id", "name", "id", "id"])).toEqual(["id", "name", "id_2", "id_3"]);
  });

  it("never collides with a real column that already uses the suffix", () => {
    expect(uniqueColumnNames(["id", "id", "id_2"])).toEqual(["id", "id_3", "id_2"]);
  });
});

describe("keyRowsByColumn", () => {
  it("keeps every positional value when names repeat", () => {
    expect(keyRowsByColumn(["id", "id"], [[1, 2]])).toEqual({
      columns: ["id", "id_2"],
      rows: [{ id: 1, id_2: 2 }]
    });
  });
});
