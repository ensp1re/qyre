import { describe, expect, it } from "vitest";
import { resolvePageRequest } from "../src/pagination.js";

describe("resolvePageRequest", () => {
  it("passes through valid page/pageSize", () => {
    expect(resolvePageRequest(2, 25)).toEqual({ page: 2, pageSize: 25, offset: 50 });
  });

  it("clamps a negative page to 0", () => {
    expect(resolvePageRequest(-5, 10)).toEqual({ page: 0, pageSize: 10, offset: 0 });
  });

  it("clamps pageSize below 1 up to 1", () => {
    expect(resolvePageRequest(0, 0)).toEqual({ page: 0, pageSize: 1, offset: 0 });
  });

  it("clamps pageSize above the max down to 200", () => {
    expect(resolvePageRequest(0, 10000)).toEqual({ page: 0, pageSize: 200, offset: 0 });
  });

  it("floors fractional input", () => {
    expect(resolvePageRequest(1.9, 10.9)).toEqual({ page: 1, pageSize: 10, offset: 10 });
  });
});
