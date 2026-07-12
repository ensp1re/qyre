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

  it("accepts an explicit confirmed flag (F107)", () => {
    const parsed = runQuerySchema.safeParse({ sql: "DELETE FROM users", confirmed: true });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.confirmed).toBe(true);
  });

  it("defaults confirmed to undefined when omitted", () => {
    const parsed = runQuerySchema.safeParse({ sql: "SELECT 1" });
    expect(parsed.success && parsed.data.confirmed).toBeUndefined();
  });
});
