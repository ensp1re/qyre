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
});
