import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAccessOverview } from "../../../../src/features/connection/api/access.js";

describe("fetchAccessOverview", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests the read-only access endpoint with the session token", async () => {
    vi.stubGlobal("window", { __QYRE_TOKEN__: "session-token" });
    const overview = { identity: "app", roles: [], grants: [], facts: [], notices: [] };
    const fetchMock = vi.fn(
      async (_input: RequestInfo, _init?: RequestInit) =>
        new Response(JSON.stringify(overview), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAccessOverview()).resolves.toEqual(overview);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/access");
    const request = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(request?.headers).get("Authorization")).toBe("Bearer session-token");
  });
});
