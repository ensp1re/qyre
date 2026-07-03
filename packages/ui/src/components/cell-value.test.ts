import { describe, expect, it } from "vitest";
import { summarizeStructuredValue } from "./cell-value.js";

describe("summarizeStructuredValue", () => {
  it("summarizes arrays, singular and plural", () => {
    expect(summarizeStructuredValue([1])).toBe("[ 1 item ]");
    expect(summarizeStructuredValue([1, 2, 3])).toBe("[ 3 items ]");
    expect(summarizeStructuredValue([])).toBe("[ 0 items ]");
  });

  it("summarizes objects, singular and plural", () => {
    expect(summarizeStructuredValue({ a: 1 })).toBe("{ 1 key }");
    expect(summarizeStructuredValue({ a: 1, b: 2 })).toBe("{ 2 keys }");
    expect(summarizeStructuredValue({})).toBe("{ 0 keys }");
  });
});
