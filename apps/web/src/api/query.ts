import type { RowPage } from "@humbdb/core";

/** Run a read-only SQL query. Throws with the server's actual rejection reason on failure. */
export async function runQuery(sql: string): Promise<RowPage> {
  const response = await fetch("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql })
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
    throw new Error(body?.error ?? `Query failed (status ${response.status}).`);
  }
  return (await response.json()) as RowPage;
}
