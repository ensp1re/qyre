import type { ConnectionTarget } from "@humbdb/core";
import { describe, expect, it } from "vitest";
import { mysqlAdapterFactory } from "./index.js";

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
