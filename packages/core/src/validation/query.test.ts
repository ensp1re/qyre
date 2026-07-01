import { describe, expect, it } from "vitest";
import { runQuerySchema } from "./query.js";

describe("runQuerySchema", () => {
  it("accepts a non-empty sql string", () => {
    expect(runQuerySchema.safeParse({ sql: "SELECT 1" }).success).toBe(true);
  });

  it("rejects an empty sql string", () => {
    expect(runQuerySchema.safeParse({ sql: "" }).success).toBe(false);
  });

  it("rejects a missing sql field", () => {
    expect(runQuerySchema.safeParse({}).success).toBe(false);
  });
});
