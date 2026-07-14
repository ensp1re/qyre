import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DestructiveConfirmationRequiredError,
  explainQuery,
  ReadOnlySessionRejectionError,
  runQuery
} from "../../../../src/features/query/api/query.js";

function mockFetchOnce(status: number, body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body)
    })
  );
}

describe("runQuery (F107/F108)", () => {
  // apps/web's vitest environment is plain Node (no window/document) - getAuthToken reads
  // window.__QYRE_TOKEN__, so every test needs a stand-in window global, same as it would get for
  // free in a real browser tab.
  beforeEach(() => {
    vi.stubGlobal("window", {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed result on success", async () => {
    mockFetchOnce(200, { columns: ["a"], rows: [{ a: 1 }], page: 0, pageSize: 25 });
    const result = await runQuery("SELECT 1");
    expect(result).toEqual({ columns: ["a"], rows: [{ a: 1 }], page: 0, pageSize: 25 });
  });

  it("returns classification alongside the result for a write-capable session", async () => {
    mockFetchOnce(200, { columns: [], rows: [], rowsAffected: 1, classification: "mutation" });
    const result = await runQuery("UPDATE users SET name = 'x' WHERE id = 1");
    expect(result.classification).toBe("mutation");
  });

  it("throws DestructiveConfirmationRequiredError on a 409 with a classification", async () => {
    mockFetchOnce(409, { error: "This statement is destructive.", classification: "destructive" });
    await expect(runQuery("DROP TABLE users")).rejects.toThrow(
      DestructiveConfirmationRequiredError
    );
  });

  it("sends confirmed: true in the request body when resubmitting", async () => {
    mockFetchOnce(200, { columns: [], rows: [], rowsAffected: 5, classification: "destructive" });
    await runQuery("DROP TABLE users", true);
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      sql: "DROP TABLE users",
      confirmed: true
    });
  });

  it("throws ReadOnlySessionRejectionError on a 400 tagged reason: read-only", async () => {
    mockFetchOnce(400, { error: "Only read-only statements are allowed.", reason: "read-only" });
    await expect(runQuery("DELETE FROM users")).rejects.toThrow(ReadOnlySessionRejectionError);
  });

  it("throws a plain Error for a 400 with no read-only reason", async () => {
    mockFetchOnce(400, { error: "Request body must be { sql: string }." });
    await expect(runQuery("")).rejects.toThrow("Request body must be { sql: string }.");
    await expect(runQuery("")).rejects.not.toBeInstanceOf(ReadOnlySessionRejectionError);
  });

  it("throws a genuine adapter error unmodified (not misclassified as read-only)", async () => {
    mockFetchOnce(500, { error: 'relation "orders_items" does not exist' });
    await expect(runQuery("SELECT * FROM orders_items")).rejects.toThrow(
      'relation "orders_items" does not exist'
    );
  });

  it("throws a friendly message when fetch itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(runQuery("SELECT 1")).rejects.toThrow("Could not reach the Qyre server");
  });
});

describe("explainQuery (F128)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the normalized plan and sends ANALYZE only when enabled", async () => {
    mockFetchOnce(200, {
      lines: ["Seq Scan on users"],
      classification: "read",
      analyzed: true
    });
    await expect(explainQuery("SELECT * FROM users", true)).resolves.toEqual({
      lines: ["Seq Scan on users"],
      classification: "read",
      analyzed: true
    });
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe("/api/query/explain");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      sql: "SELECT * FROM users",
      analyze: true
    });
  });

  it("surfaces a native planning error", async () => {
    mockFetchOnce(400, { error: 'relation "missing" does not exist' });
    await expect(explainQuery("SELECT * FROM missing", false)).rejects.toThrow(
      'relation "missing" does not exist'
    );
  });

  it("throws a friendly message when fetch itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(explainQuery("SELECT 1", false)).rejects.toThrow(
      "Could not reach the Qyre server"
    );
  });
});
