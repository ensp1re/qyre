import type { ConnectionTarget } from "@qyre/core";
import { describe, expect, it, vi } from "vitest";
import { MysqlAdapter, mysqlAdapterFactory } from "./index.js";

describe("mysqlAdapterFactory", () => {
  it("supports mysql targets", () => {
    const target: ConnectionTarget = { engine: "mysql", raw: "mysql://localhost/db" };
    expect(mysqlAdapterFactory.supports(target)).toBe(true);
  });

  it("does not support postgres targets", () => {
    const target: ConnectionTarget = { engine: "postgres", raw: "postgres://localhost/db" };
    expect(mysqlAdapterFactory.supports(target)).toBe(false);
  });

  it("creates an adapter with the mysql engine", () => {
    const target: ConnectionTarget = { engine: "mysql", raw: "mysql://localhost/db" };
    const adapter = mysqlAdapterFactory.create(target);
    expect(adapter.engine).toBe("mysql");
  });
});

describe("MysqlAdapter pool error routing (F028)", () => {
  // mysql2's createPool() is lazy - it never attempts a real connection until the first query, so
  // connect() succeeds against a bogus target and this stays a fast, DB-free unit test. Whether
  // mysql2 actually emits this event for a given real-world failure is out of scope here (already
  // exercised live by the "survives an idle pooled connection" integration test); this only proves
  // the routing logic itself - the point of F028 - is wired correctly.
  async function createConnectedAdapter(): Promise<MysqlAdapter> {
    const adapter = new MysqlAdapter({ engine: "mysql", raw: "mysql://localhost:1/db" });
    await adapter.connect();
    return adapter;
  }

  function emitPoolError(adapter: MysqlAdapter): void {
    const underlyingPool = (adapter as unknown as { pool: { pool: NodeJS.EventEmitter } }).pool
      .pool;
    underlyingPool.emit("error", new Error("simulated drop"));
  }

  it("routes a pool error through onConnectionEvent when set", async () => {
    const adapter = await createConnectedAdapter();
    try {
      const events: Array<{ level: string; message: string }> = [];
      adapter.onConnectionEvent = (level, message) => events.push({ level, message });

      emitPoolError(adapter);

      expect(events).toEqual([
        { level: "error", message: expect.stringContaining("MySQL pool error") }
      ]);
    } finally {
      await adapter.disconnect();
    }
  });

  it("falls back to console.error when onConnectionEvent is not set", async () => {
    const adapter = await createConnectedAdapter();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      emitPoolError(adapter);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining("MySQL pool error"));
    } finally {
      spy.mockRestore();
      await adapter.disconnect();
    }
  });
});
