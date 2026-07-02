import type { ConnectionTarget } from "@humbdb/core";
import { describe, expect, it } from "vitest";
import { sqliteAdapterFactory } from "./index.js";

describe("sqliteAdapterFactory", () => {
  it("supports sqlite targets", () => {
    const target: ConnectionTarget = { engine: "sqlite", raw: "./app.db" };
    expect(sqliteAdapterFactory.supports(target)).toBe(true);
  });

  it("does not support postgres targets", () => {
    const target: ConnectionTarget = { engine: "postgres", raw: "postgres://localhost/db" };
    expect(sqliteAdapterFactory.supports(target)).toBe(false);
  });

  it("creates an adapter with the sqlite engine", () => {
    const target: ConnectionTarget = { engine: "sqlite", raw: "./app.db" };
    const adapter = sqliteAdapterFactory.create(target);
    expect(adapter.engine).toBe("sqlite");
  });
});
