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
