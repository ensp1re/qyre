import { afterEach, describe, expect, it, vi } from "vitest";
import { createTable } from "../../../../src/features/schema/api/create-table.js";

describe("createTable", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to the selected schema", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ schema: "analytics", table: "events" }), { status: 200 })
      );
    vi.stubGlobal("window", {});
    vi.stubGlobal("fetch", fetchMock);

    await createTable("analytics", "events", [
      { name: "id", dataType: "integer", nullable: false, default: null }
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/schemas/analytics/tables",
      expect.objectContaining({ method: "POST" })
    );
  });
});
