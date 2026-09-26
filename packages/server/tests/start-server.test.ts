import type { AdapterFactory } from "@qyre/driver-contract";
import { describe, expect, it } from "vitest";
import { startServer } from "../src/index.js";
import { makeFakeAdapter } from "./support/fake-adapter.js";

describe("startServer", () => {
  it("reports the OS-assigned port when started on port 0", async () => {
    const server = await startServer({ port: 0, logger: false });
    try {
      const url = new URL(server.url);
      expect(url.hostname).toBe("127.0.0.1");
      expect(Number(url.port)).toBeGreaterThan(0);

      const response = await fetch(new URL("/api/health", server.url), {
        headers: { authorization: `Bearer ${server.authToken}` }
      });
      expect(response.ok).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("exposes the adapter the browser switched to, not the startup adapter", async () => {
    const startupAdapter = makeFakeAdapter();
    const switchedAdapter = makeFakeAdapter();
    const factory: AdapterFactory = {
      engine: "postgres",
      supports: (target) => target.engine === "postgres",
      create: () => switchedAdapter
    };
    const server = await startServer({
      port: 0,
      logger: false,
      adapter: startupAdapter,
      target: { engine: "postgres", raw: "postgres://user:pass@localhost:5432/old" },
      adapterFactories: [factory]
    });
    try {
      expect(server.currentAdapter()).toBe(startupAdapter);

      const response = await server.app.inject({
        method: "POST",
        url: "/api/connect",
        payload: { target: "postgres://user:pass@localhost:5432/new" },
        headers: { authorization: `Bearer ${server.authToken}` }
      });
      expect(response.statusCode).toBe(200);
      expect(server.currentAdapter()).toBe(switchedAdapter);
    } finally {
      await server.close();
    }
  });
});
