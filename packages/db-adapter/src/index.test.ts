import type { ConnectionTarget } from "@humb/core";
import { describe, expect, it } from "vitest";
import type { AdapterFactory, DatabaseAdapter } from "./index.js";
import { resolveAdapter, UnsupportedEngineError } from "./index.js";

const fakeAdapter = { engine: "postgres" } as DatabaseAdapter;

const postgresFactory: AdapterFactory = {
  engine: "postgres",
  supports: (target) => target.engine === "postgres",
  create: () => fakeAdapter
};

describe("resolveAdapter", () => {
  const target: ConnectionTarget = { engine: "postgres", raw: "postgres://localhost/db" };

  it("returns an adapter from a supporting factory", () => {
    expect(resolveAdapter([postgresFactory], target)).toBe(fakeAdapter);
  });

  it("throws when no factory supports the target", () => {
    expect(() => resolveAdapter([], target)).toThrow(UnsupportedEngineError);
  });
});
