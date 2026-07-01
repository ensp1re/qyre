import { describe, expect, it } from "vitest";
import { rowsQuerySchema } from "./rows.js";

describe("rowsQuerySchema", () => {
  it("defaults page and pageSize when omitted", () => {
    expect(rowsQuerySchema.parse({})).toEqual({ page: 0, pageSize: 50 });
  });

  it("coerces string query params to numbers", () => {
    expect(rowsQuerySchema.parse({ page: "2", pageSize: "10" })).toEqual({
      page: 2,
      pageSize: 10
    });
  });

  it("rejects a pageSize above the max", () => {
    expect(rowsQuerySchema.safeParse({ pageSize: 500 }).success).toBe(false);
  });

  it("rejects a negative page", () => {
    expect(rowsQuerySchema.safeParse({ page: -1 }).success).toBe(false);
  });
});
