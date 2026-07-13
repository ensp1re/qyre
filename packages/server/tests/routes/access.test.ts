import { stubReadOnlyCapabilities } from "@qyre/driver-contract";
import { describe, expect, it } from "vitest";
import { createServer } from "../../src/index.js";
import { authHeaders } from "../helpers/auth.js";
import { makeFakeAdapter } from "../support/fake-adapter.js";

const overview = {
  identity: "app_user",
  roles: [{ name: "reader", isCurrent: true, attributes: ["login"] }],
  grants: ["SELECT on public.users"],
  facts: [{ label: "Session user", value: "app_user" }],
  notices: []
};

describe("GET /api/access (F119)", () => {
  it("returns the adapter's read-only access summary", async () => {
    const adapter = makeFakeAdapter({
      getCapabilities: async () => ({
        ...stubReadOnlyCapabilities(true),
        supportsAccessInspection: true
      }),
      admin: { inspectAccess: async () => overview }
    });
    const app = createServer({ adapter });
    const response = await app.inject({
      method: "GET",
      url: "/api/access",
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(overview);
    await app.close();
  });

  it("remains available when the Qyre session is forced read-only", async () => {
    const adapter = makeFakeAdapter({
      getCapabilities: async () => ({
        ...stubReadOnlyCapabilities(true),
        supportsAccessInspection: true
      }),
      admin: { inspectAccess: async () => overview }
    });
    const app = createServer({ adapter, readOnly: true });
    const response = await app.inject({
      method: "GET",
      url: "/api/access",
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("returns a clean unsupported response", async () => {
    const app = createServer({ adapter: makeFakeAdapter() });
    const response = await app.inject({
      method: "GET",
      url: "/api/access",
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("does not support access inspection");
    await app.close();
  });
});
