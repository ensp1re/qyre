import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "../../../src/shared/api/fetch-json.js";

function mockResponse(init: { status: number; body?: unknown }): Response {
  const hasBody = init.body !== undefined;
  return new Response(hasBody ? JSON.stringify(init.body) : null, { status: init.status });
}

describe("fetchJson", () => {
  beforeEach(() => {
    // The Vitest environment is Node, while getAuthToken reads the browser window.
    vi.stubGlobal("window", {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves with the parsed JSON body on a normal 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse({ status: 200, body: { schema: "public" } }))
    );
    await expect(fetchJson("/api/whatever")).resolves.toEqual({ schema: "public" });
  });

  it("resolves with null on a 204 with no body - F114's dropTable/dropColumn/dropIndex routes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({ status: 204 })));
    await expect(fetchJson("/api/tables/public/orders")).resolves.toBeNull();
  });

  it("throws the server's error message on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockResponse({ status: 403, body: { error: "Forbidden." } }))
    );
    await expect(fetchJson("/api/whatever")).rejects.toThrow("Forbidden.");
  });

  it("throws a friendly message when fetch itself rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(fetchJson("/api/whatever")).rejects.toThrow("Could not reach the Qyre server");
  });
});
