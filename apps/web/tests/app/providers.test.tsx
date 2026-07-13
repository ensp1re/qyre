import { describe, expect, it, vi } from "vitest";
import { refreshPermissionQueries } from "../../src/app/providers.js";

describe("refreshPermissionQueries", () => {
  it("invalidates session capabilities and every table-permission cache", async () => {
    const invalidateQueries = vi.fn(async (_filters: { queryKey: string[] }) => undefined);

    await refreshPermissionQueries({ invalidateQueries } as never);

    expect(invalidateQueries.mock.calls.map(([filters]) => filters)).toEqual([
      { queryKey: ["overview"] },
      { queryKey: ["allTables"] },
      { queryKey: ["table"] }
    ]);
  });
});
