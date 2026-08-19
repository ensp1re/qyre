import { describe, expect, it } from "vitest";
import { csvLine } from "../../src/services/transfer/csv.js";

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

  // F154: Excel and Sheets strip leading whitespace on import and then evaluate what follows, so
  // anchoring the guard on the bare character let every whitespace-prefixed variant through.
  it("prefixes a formula hidden behind leading whitespace", () => {
    expect(csvLine(["\t=cmd()"])).toBe("'\t=cmd()");
    expect(csvLine([" =cmd()"])).toBe("' =cmd()");
    // A CR-prefixed formula gets both defenses: the apostrophe, and quoting for the CR itself.
    expect(csvLine(["\r=cmd()"])).toBe('"\'\r=cmd()"');
  });

  // F154: a bare carriage return is a record separator to Excel and many CSV parsers, so leaving
  // it unquoted split the row it sat in.
  it("quotes a field containing a carriage return", () => {
    expect(csvLine(["line1\rline2"])).toBe('"line1\rline2"');
  });
});
