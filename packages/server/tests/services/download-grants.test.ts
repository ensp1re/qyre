import { afterEach, describe, expect, it, vi } from "vitest";
import {
  consumeDownloadGrant,
  issueDownloadGrant
} from "../../src/services/access/download-grants.js";

const TARGET = { schema: "public", table: "users", format: "csv" };

afterEach(() => {
  vi.useRealTimers();
});

describe("download grants (plan 0011 P3)", () => {
  it("accepts a freshly issued grant exactly once", () => {
    const grant = issueDownloadGrant(TARGET);

    expect(consumeDownloadGrant(grant, TARGET)).toBe(true);
    // A consumed grant cannot be replayed from browser history.
    expect(consumeDownloadGrant(grant, TARGET)).toBe(false);
  });

  it("rejects a grant presented for a different export, and burns it", () => {
    const grant = issueDownloadGrant(TARGET);

    expect(consumeDownloadGrant(grant, { ...TARGET, table: "secrets" })).toBe(false);
    expect(consumeDownloadGrant(grant, TARGET)).toBe(false);
  });

  it("rejects a grant that was never issued", () => {
    expect(consumeDownloadGrant("not-a-real-grant", TARGET)).toBe(false);
  });

  it("rejects a grant past its TTL, and does not leave it spendable afterwards", () => {
    vi.useFakeTimers();
    const grant = issueDownloadGrant(TARGET);

    vi.advanceTimersByTime(61_000);
    expect(consumeDownloadGrant(grant, TARGET)).toBe(false);
    expect(consumeDownloadGrant(grant, TARGET)).toBe(false);
  });

  it("issues unpredictable, distinct ids", () => {
    const grants = new Set(Array.from({ length: 50 }, () => issueDownloadGrant(TARGET)));

    expect(grants.size).toBe(50);
    for (const grant of grants) expect(grant).toMatch(/^[0-9a-f]{64}$/);
  });
});
