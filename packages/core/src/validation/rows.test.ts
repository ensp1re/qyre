import { describe, expect, it } from "vitest";
import { rowsQuerySchema } from "./rows.js";

describe("rowsQuerySchema", () => {
  it("defaults page, pageSize, and sortDirection when omitted", () => {
    expect(rowsQuerySchema.parse({})).toEqual({ page: 0, pageSize: 50, sortDirection: "asc" });
  });

  it("coerces string query params to numbers", () => {
    expect(rowsQuerySchema.parse({ page: "2", pageSize: "10" })).toEqual({
      page: 2,
      pageSize: 10,
      sortDirection: "asc"
    });
  });

  it("rejects a pageSize above the max", () => {
    expect(rowsQuerySchema.safeParse({ pageSize: 500 }).success).toBe(false);
  });

  it("rejects a negative page", () => {
    expect(rowsQuerySchema.safeParse({ page: -1 }).success).toBe(false);
  });

  it("accepts a sortColumn with an explicit sortDirection (F065)", () => {
    expect(rowsQuerySchema.parse({ sortColumn: "name", sortDirection: "desc" })).toEqual({
      page: 0,
      pageSize: 50,
      sortColumn: "name",
      sortDirection: "desc"
    });
  });

  it("defaults sortDirection to asc when sortColumn is given alone", () => {
    expect(rowsQuerySchema.parse({ sortColumn: "name" }).sortDirection).toBe("asc");
  });

  it("rejects an empty sortColumn", () => {
    expect(rowsQuerySchema.safeParse({ sortColumn: "" }).success).toBe(false);
  });

  it("rejects an invalid sortDirection", () => {
    expect(rowsQuerySchema.safeParse({ sortDirection: "sideways" }).success).toBe(false);
  });

  it("parses a valid filters JSON array (F072)", () => {
    const filters = JSON.stringify([{ column: "status", op: "eq", value: "active" }]);
    expect(rowsQuerySchema.parse({ filters }).filters).toEqual([
      { column: "status", op: "eq", value: "active" }
    ]);
  });

  it("accepts isNull/isNotNull filters without a value", () => {
    const filters = JSON.stringify([{ column: "deletedAt", op: "isNull" }]);
    expect(rowsQuerySchema.parse({ filters }).filters).toEqual([
      { column: "deletedAt", op: "isNull" }
    ]);
  });

  it("rejects a non-isNull filter missing a value", () => {
    const filters = JSON.stringify([{ column: "status", op: "eq" }]);
    expect(rowsQuerySchema.safeParse({ filters }).success).toBe(false);
  });

  it("rejects an unknown filter op", () => {
    const filters = JSON.stringify([{ column: "status", op: "sideways", value: "x" }]);
    expect(rowsQuerySchema.safeParse({ filters }).success).toBe(false);
  });

  it("rejects malformed filters JSON", () => {
    expect(rowsQuerySchema.safeParse({ filters: "not json" }).success).toBe(false);
  });

  it("leaves filters undefined when omitted", () => {
    expect(rowsQuerySchema.parse({}).filters).toBeUndefined();
  });

  it("trims and accepts a whole-table search", () => {
    expect(rowsQuerySchema.parse({ search: "  admin  " }).search).toBe("admin");
  });

  it("rejects an empty whole-table search", () => {
    expect(rowsQuerySchema.safeParse({ search: "   " }).success).toBe(false);
  });
});
