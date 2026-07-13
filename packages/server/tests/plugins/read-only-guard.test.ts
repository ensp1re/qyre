import { describe, expect, it } from "vitest";
import { createServer } from "../../src/index.js";
import { permissionRoute } from "../../src/services/permission-denied.js";
import { authHeaders } from "../helpers/auth.js";

/**
 * No mutating route exists yet (F096 lands before any write feature), so these tests register a
 * These tests register a throwaway route directly on the built app to exercise the guard the same
 * way a real write route does: opting into both mutating and permission-denial metadata.
 */
describe("read-only guard (F096)", () => {
  it("rejects a route marked mutating when the session is read-only", async () => {
    const app = createServer({ readOnly: true });
    app.post(
      "/api/__test-mutation",
      permissionRoute({ operation: "insert", target: "table", likelyMissingGrant: "INSERT" }),
      async () => ({ ok: true })
    );
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/__test-mutation",
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: "Qyre is running in read-only mode (--read-only). This action is disabled."
    });
    await app.close();
  });

  it("allows a route marked mutating when the session is not read-only", async () => {
    const app = createServer({ readOnly: false });
    app.post(
      "/api/__test-mutation",
      permissionRoute({ operation: "insert", target: "table", likelyMissingGrant: "INSERT" }),
      async () => ({ ok: true })
    );
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/__test-mutation",
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("never touches a route that isn't marked mutating, even in read-only mode", async () => {
    const app = createServer({ readOnly: true });
    app.get("/api/__test-read", { config: { mutating: false } }, async () => ({ ok: true }));
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/api/__test-read",
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("defaults to not read-only when the option is omitted", async () => {
    const app = createServer();
    app.post(
      "/api/__test-mutation",
      permissionRoute({ operation: "insert", target: "table", likelyMissingGrant: "INSERT" }),
      async () => ({ ok: true })
    );
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/__test-mutation",
      headers: authHeaders(app)
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });
});
