import type { ConnectionTarget } from "@qyre/core";
import { describe, expect, it } from "vitest";
import type { AdapterFactory, DatabaseAdapter } from "../src/contract.js";
import { UnsupportedEngineError } from "../src/errors.js";
import { resolveAdapter } from "../src/resolve.js";

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
