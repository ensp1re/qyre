import { describe, expect, it } from "vitest";
import { createServer } from "../src/index.js";

function collectingStream(): { write(msg: string): void; lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    write(msg: string) {
      lines.push(msg);
    }
  };
}

describe("request logging redacts the session token (F130)", () => {
  it("never writes the live token when a verbose request hits the export ?token= path", async () => {
    const stream = collectingStream();
    const app = createServer({
      authToken: "super-secret-token",
      logger: { level: "info", stream }
    });

    await app.inject({
      method: "GET",
      url: "/api/health?token=super-secret-token"
    });
    await app.close();

    expect(stream.lines.length).toBeGreaterThan(0);
    const logged = stream.lines.join("\n");
    expect(logged).not.toContain("super-secret-token");
    // URLSearchParams encodes [redacted] in the logged query.
    expect(logged).toContain("token=%5Bredacted%5D");
  });

  it("still logs unrelated query params in full", async () => {
    const stream = collectingStream();
    const app = createServer({ authToken: "t", logger: { level: "info", stream } });

    await app.inject({
      method: "GET",
      url: "/api/health?other=keep-me",
      headers: { authorization: "Bearer t" }
    });
    await app.close();

    expect(stream.lines.join("\n")).toContain("keep-me");
  });

  it("logs nothing at all when logger is omitted (default false)", async () => {
    const app = createServer({ authToken: "t" });
    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { authorization: "Bearer t" }
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });
});
