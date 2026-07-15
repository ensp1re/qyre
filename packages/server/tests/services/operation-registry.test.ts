import { describe, expect, it } from "vitest";
import { OperationRegistry } from "../../src/services/observability/operation-registry.js";

describe("OperationRegistry", () => {
  it("returns false for an id that was never registered", async () => {
    const registry = new OperationRegistry();
    expect(await registry.cancel("unknown")).toBe(false);
  });

  it("invokes the registered callback and returns true", async () => {
    const registry = new OperationRegistry();
    let called = false;
    registry.register("op-1", async () => {
      called = true;
    });
    expect(await registry.cancel("op-1")).toBe(true);
    expect(called).toBe(true);
  });

  it("removes the callback after cancelling, so a second cancel is a no-op", async () => {
    const registry = new OperationRegistry();
    let calls = 0;
    registry.register("op-1", async () => {
      calls += 1;
    });
    await registry.cancel("op-1");
    expect(await registry.cancel("op-1")).toBe(false);
    expect(calls).toBe(1);
  });

  it("unregister removes a callback without invoking it", async () => {
    const registry = new OperationRegistry();
    let called = false;
    registry.register("op-1", async () => {
      called = true;
    });
    registry.unregister("op-1");
    expect(await registry.cancel("op-1")).toBe(false);
    expect(called).toBe(false);
  });

  it("a later register for the same id overwrites the earlier one", async () => {
    const registry = new OperationRegistry();
    const calls: string[] = [];
    registry.register("op-1", async () => {
      calls.push("first");
    });
    registry.register("op-1", async () => {
      calls.push("second");
    });
    await registry.cancel("op-1");
    expect(calls).toEqual(["second"]);
  });
});
