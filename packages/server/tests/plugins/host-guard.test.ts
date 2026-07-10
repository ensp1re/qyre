import { describe, expect, it } from "vitest";
import { createServer } from "../../src/index.js";
import { authHeaders } from "../helpers/auth.js";

describe("host guard", () => {
  it("rejects a request with a non-loopback Host header (DNS-rebinding, F025)", async () => {
    const app = createServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { host: "attacker.example:7717" }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "Invalid Host header." });
    await app.close();
  });

  it("accepts requests with 127.0.0.1, localhost, and IPv6 loopback Host headers", async () => {
    const app = createServer();
    for (const host of ["127.0.0.1:7717", "localhost:7717", "[::1]:7717", "localhost"]) {
      const response = await app.inject({
        method: "GET",
        url: "/api/health",
        headers: { host, ...authHeaders(app) }
      });
      expect(response.statusCode).toBe(200);
    }
    await app.close();
  });
});
