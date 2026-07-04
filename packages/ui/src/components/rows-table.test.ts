import { describe, expect, it } from "vitest";
import { toCsv } from "./rows-table.js";

describe("toCsv", () => {
  it("quotes values containing commas, quotes, or newlines", () => {
    const csv = toCsv(
      ["a", "b"],
      [
        { a: "x,y", b: 'he said "hi"' },
        { a: "line1\nline2", b: "z" }
      ]
    );
    expect(csv).toBe('a,b\n"x,y","he said ""hi"""\n"line1\nline2",z');
  });

  it("prefixes a leading apostrophe to values that would be read as a spreadsheet formula", () => {
    const csv = toCsv(
      ["formula"],
      [{ formula: "=SUM(A1:A2)" }, { formula: "+1" }, { formula: "-1" }, { formula: "@cmd" }]
    );
    expect(csv).toBe("formula\n'=SUM(A1:A2)\n'+1\n'-1\n'@cmd");
  });

  it("leaves ordinary values that merely contain those characters mid-string untouched", () => {
    expect(toCsv(["v"], [{ v: "a=b" }])).toBe("v\na=b");
  });
});
