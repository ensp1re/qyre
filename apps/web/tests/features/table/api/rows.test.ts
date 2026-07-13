import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportRowsUrl } from "../../../../src/features/table/api/rows.js";

describe("exportRowsUrl (F118)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { __QYRE_TOKEN__: "session-token" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds a format-specific URL with the current sort, filters, and download token", () => {
    const value = exportRowsUrl(
      "public data",
      "order/items",
      "json",
      { column: "created_at", direction: "desc" },
      [{ column: "status", op: "eq", value: "open" }]
    );
    const url = new URL(value, "http://localhost");

    expect(url.pathname).toBe("/api/tables/public%20data/order%2Fitems/export.json");
    expect(url.searchParams.get("sortColumn")).toBe("created_at");
    expect(url.searchParams.get("sortDirection")).toBe("desc");
    expect(JSON.parse(url.searchParams.get("filters") ?? "[]")).toEqual([
      { column: "status", op: "eq", value: "open" }
    ]);
    expect(url.searchParams.get("token")).toBe("session-token");
  });

  it("omits the query string when no optional state or token exists", () => {
    vi.stubGlobal("window", {});
    expect(exportRowsUrl("main", "users", "sql")).toBe("/api/tables/main/users/export.sql");
  });
});
