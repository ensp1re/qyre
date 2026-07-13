import { describe, expect, it } from "vitest";
import { csvImportMappingSchema, csvImportModeSchema } from "../../src/validation/csv-import.js";

describe("CSV import validation", () => {
  it("accepts every import mode", () => {
    expect(
      ["inspect", "validate", "import"].every((mode) => csvImportModeSchema.safeParse(mode).success)
    ).toBe(true);
  });

  it("accepts mapped and ignored CSV columns, but rejects non-string targets", () => {
    expect(csvImportMappingSchema.safeParse({ Name: "name", Extra: null }).success).toBe(true);
    expect(csvImportMappingSchema.safeParse({ Name: 42 }).success).toBe(false);
  });
});
