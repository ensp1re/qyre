import {
  canPersistTarget,
  nextRecentTargets,
  parseRecentTargets
} from "../../../../src/features/connection/model/recent-targets.js";
import { describe, expect, it } from "vitest";

describe("recent targets", () => {
  it("never persists credential-bearing URLs", () => {
    expect(canPersistTarget("postgres://user:secret@localhost:5432/db")).toBe(false);
    expect(canPersistTarget("mongodb://localhost/db?password=secret")).toBe(false);
    expect(canPersistTarget("postgres://localhost:5432/db")).toBe(true);
    expect(canPersistTarget("./local.db")).toBe(true);
  });

  it("catches compound credential-param names, not just exact matches (F132)", () => {
    // A real libpq param - contains "password" but isn't spelled exactly "password".
    expect(canPersistTarget("postgres://localhost/db?sslpassword=hunter2")).toBe(false);
    expect(canPersistTarget("mongodb://localhost/db?access_token=abc123")).toBe(false);
    expect(canPersistTarget("mongodb://localhost/db?authSecret=abc123")).toBe(false);
    expect(canPersistTarget("mongodb://localhost/db?tlsCertificateKeyFilePassword=abc123")).toBe(
      false
    );
    // An unrelated param with no credential-shaped substring still persists.
    expect(canPersistTarget("postgres://localhost/db?sslmode=require")).toBe(true);
  });

  it("purges sensitive legacy entries while parsing", () => {
    expect(
      parseRecentTargets([
        { raw: "postgres://user:secret@localhost/db", display: "postgres://***@localhost/db" },
        { raw: "./local.db", display: "./local.db" }
      ])
    ).toEqual([{ raw: "./local.db", display: "./local.db" }]);
  });

  it("deduplicates and caps the session list", () => {
    const entries = Array.from({ length: 5 }, (_, index) => ({
      raw: `./db-${index}.sqlite`,
      display: `db-${index}`
    }));
    const next = nextRecentTargets(entries, entries[3]!);

    expect(next).toHaveLength(5);
    expect(next[0]).toEqual(entries[3]);
    expect(new Set(next.map((entry) => entry.raw)).size).toBe(5);
  });
});
