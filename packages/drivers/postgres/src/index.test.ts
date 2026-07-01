import type { ConnectionTarget } from "@humb/core";
import { describe, expect, it } from "vitest";
import { postgresAdapterFactory } from "./index.js";

describe("postgresAdapterFactory", () => {
  it("supports postgres targets", () => {
    const target: ConnectionTarget = { engine: "postgres", raw: "postgres://localhost/db" };
    expect(postgresAdapterFactory.supports(target)).toBe(true);
  });

  it("creates an adapter with the postgres engine", () => {
    const target: ConnectionTarget = { engine: "postgres", raw: "postgres://localhost/db" };
    const adapter = postgresAdapterFactory.create(target);
    expect(adapter.engine).toBe("postgres");
  });
});
