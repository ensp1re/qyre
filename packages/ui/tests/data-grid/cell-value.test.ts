import { describe, expect, it } from "vitest";
import {
  classifyUrlValue,
  isBinaryValue,
  isLongString,
  LONG_STRING_THRESHOLD,
  previewBinaryValue,
  previewStructuredValue,
  summarizeBinaryValue,
  summarizeStructuredValue,
  toHex
} from "../../src/data-grid/cell-value.js";

describe("classifyUrlValue", () => {
  it("recognizes http(s) image URLs by pathname extension", () => {
    expect(classifyUrlValue("https://example.com/path/photo.webp?size=small")).toEqual({
      href: "https://example.com/path/photo.webp?size=small",
      label: "example.com/path/photo.webp",
      kind: "image"
    });
  });

  it("recognizes plain http(s) URLs as links", () => {
    expect(classifyUrlValue("https://example.com/docs")).toEqual({
      href: "https://example.com/docs",
      label: "example.com/docs",
      kind: "link"
    });
  });

  it("rejects non-http schemes, invalid URLs, and whitespace-padded strings", () => {
    expect(classifyUrlValue("mailto:person@example.com")).toBeNull();
    expect(classifyUrlValue("not a url")).toBeNull();
    expect(classifyUrlValue(" https://example.com ")).toBeNull();
  });
});

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

describe("isLongString", () => {
  it("rejects strings at or under the threshold", () => {
    expect(isLongString("short")).toBe(false);
    expect(isLongString("x".repeat(LONG_STRING_THRESHOLD))).toBe(false);
  });

  it("accepts strings past the threshold", () => {
    expect(isLongString("x".repeat(LONG_STRING_THRESHOLD + 1))).toBe(true);
  });

  it("rejects non-strings, including long arrays/numbers", () => {
    expect(isLongString(12345)).toBe(false);
    expect(isLongString(null)).toBe(false);
    expect(isLongString(Array.from({ length: 200 }, (_, i) => i))).toBe(false);
  });
});

describe("isBinaryValue", () => {
  it("recognizes the shape Buffer.prototype.toJSON() produces", () => {
    expect(isBinaryValue({ type: "Buffer", data: [104, 105] })).toBe(true);
  });

  it("rejects plain objects/arrays and primitives, including near-miss shapes", () => {
    expect(isBinaryValue({ a: 1 })).toBe(false);
    expect(isBinaryValue([1, 2, 3])).toBe(false);
    expect(isBinaryValue({ type: "Buffer", data: "not-an-array" })).toBe(false);
    expect(isBinaryValue({ type: "NotBuffer", data: [1] })).toBe(false);
    expect(isBinaryValue("hello")).toBe(false);
    expect(isBinaryValue(null)).toBe(false);
  });
});

describe("toHex", () => {
  it("renders bytes as space-separated lowercase hex pairs", () => {
    expect(toHex([104, 101, 108, 108, 111])).toBe("68 65 6c 6c 6f");
    expect(toHex([0, 255])).toBe("00 ff");
  });
});

describe("summarizeBinaryValue", () => {
  it("summarizes byte count, singular and plural", () => {
    expect(summarizeBinaryValue({ type: "Buffer", data: [1] })).toBe("binary · 1 byte");
    expect(summarizeBinaryValue({ type: "Buffer", data: [1, 2, 3] })).toBe("binary · 3 bytes");
    expect(summarizeBinaryValue({ type: "Buffer", data: [] })).toBe("binary · 0 bytes");
  });
});

describe("previewBinaryValue", () => {
  it("returns the full hex when it fits", () => {
    expect(previewBinaryValue({ type: "Buffer", data: [104, 105] })).toBe("68 69");
  });

  it("truncates with an ellipsis past the byte cap", () => {
    const data = Array.from({ length: 20 }, (_, i) => i);
    const preview = previewBinaryValue({ type: "Buffer", data }, 4);
    expect(preview).toBe("00 01 02 03…");
  });
});
