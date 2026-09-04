import { afterEach, describe, expect, it, vi } from "vitest";
import {
  consumeDownloadGrant,
  issueDownloadGrant
} from "../../src/services/access/download-grants.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("download grants (PLAN.md P3)", () => {
  it("accepts a freshly issued grant exactly once", () => {
    const grant = issueDownloadGrant();

    expect(consumeDownloadGrant(grant)).toBe(true);
    // A consumed grant cannot be replayed from browser history.
    expect(consumeDownloadGrant(grant)).toBe(false);
  });

  it("rejects a grant that was never issued", () => {
    expect(consumeDownloadGrant("not-a-real-grant")).toBe(false);
  });

  it("rejects a grant past its TTL, and does not leave it spendable afterwards", () => {
    vi.useFakeTimers();
    const grant = issueDownloadGrant();

    vi.advanceTimersByTime(61_000);
    expect(consumeDownloadGrant(grant)).toBe(false);
    expect(consumeDownloadGrant(grant)).toBe(false);
  });

  it("issues unpredictable, distinct ids", () => {
    const grants = new Set(Array.from({ length: 50 }, () => issueDownloadGrant()));

    expect(grants.size).toBe(50);
    for (const grant of grants) expect(grant).toMatch(/^[0-9a-f]{64}$/);
  });
});
