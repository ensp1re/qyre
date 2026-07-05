import { describe, expect, it } from "vitest";
import { csvLine } from "./csv.js";

describe("csvLine", () => {
  it("joins plain values with commas", () => {
    expect(csvLine(["id", "name", 42])).toBe("id,name,42");
  });

  it("renders null and undefined as empty fields", () => {
    expect(csvLine([null, undefined, "x"])).toBe(",,x");
  });

  it("JSON-stringifies non-string, non-primitive values", () => {
    expect(csvLine([{ a: 1 }])).toBe('"{""a"":1}"');
  });

  it("quotes and escapes a field containing a comma", () => {
    expect(csvLine(["a,b"])).toBe('"a,b"');
  });

  it("quotes and doubles internal quotes for a field containing a quote", () => {
    expect(csvLine(['say "hi"'])).toBe('"say ""hi"""');
  });

  it("quotes a field containing a newline", () => {
    expect(csvLine(["line1\nline2"])).toBe('"line1\nline2"');
  });

  it("prefixes a leading apostrophe on a formula-injection-shaped value (F035)", () => {
    expect(csvLine(["=cmd()"])).toBe("'=cmd()");
    expect(csvLine(["+1+1"])).toBe("'+1+1");
    expect(csvLine(["-1"])).toBe("'-1");
    expect(csvLine(["@sum"])).toBe("'@sum");
  });

  it("does not prefix a value that merely contains (not starts with) a formula char", () => {
    expect(csvLine(["a=b"])).toBe("a=b");
  });
});
