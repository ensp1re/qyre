import { describe, expect, it } from "vitest";
import { previewStructuredValue, summarizeStructuredValue } from "./cell-value.js";

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

describe("previewStructuredValue", () => {
  it("returns the full JSON when it fits", () => {
    expect(previewStructuredValue({ a: 1 })).toBe('{"a":1}');
    expect(previewStructuredValue(["x", "y"])).toBe('["x","y"]');
  });

  it("truncates long JSON with an ellipsis at the cap", () => {
    const long = { key: "v".repeat(200) };
    const preview = previewStructuredValue(long, 20);
    expect(preview).toHaveLength(20);
    expect(preview.endsWith("…")).toBe(true);
    expect(preview.startsWith('{"key":"vvv')).toBe(true);
  });
});
