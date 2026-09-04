import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportRowsUrl } from "../../../../src/features/table/api/rows.js";

describe("exportRowsUrl (F118)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { __QYRE_TOKEN__: "session-token" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ grant: "one-shot-grant" })))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds a format-specific URL with the current sort, filters, search, and a grant", async () => {
    const value = await exportRowsUrl(
      "public data",
      "order/items",
      "json",
      { column: "created_at", direction: "desc" },
      [{ column: "status", op: "eq", value: "open" }],
      "admin"
    );
    const url = new URL(value, "http://localhost");

    expect(url.pathname).toBe("/api/tables/public%20data/order%2Fitems/export.json");
    expect(url.searchParams.get("sortColumn")).toBe("created_at");
    expect(url.searchParams.get("sortDirection")).toBe("desc");
    expect(JSON.parse(url.searchParams.get("filters") ?? "[]")).toEqual([
      { column: "status", op: "eq", value: "open" }
    ]);
    expect(url.searchParams.get("search")).toBe("admin");
    expect(url.searchParams.get("grant")).toBe("one-shot-grant");
  });

  it("never puts the session token in the URL, which browser history would keep", async () => {
    const value = await exportRowsUrl("main", "users", "sql");

    expect(value).not.toContain("session-token");
    expect(new URL(value, "http://localhost").searchParams.get("token")).toBeNull();
  });

  it("still carries a grant when there is no sort, filter, or search state", async () => {
    const url = new URL(await exportRowsUrl("main", "users", "sql"), "http://localhost");

    expect(url.pathname).toBe("/api/tables/main/users/export.sql");
    expect(url.searchParams.get("grant")).toBe("one-shot-grant");
  });
});
