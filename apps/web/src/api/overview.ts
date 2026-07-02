import type { DatabaseOverview } from "@humbdb/core";

/** Fetch the database's schemas and tables. */
export async function fetchOverview(): Promise<DatabaseOverview> {
  const response = await fetch("/api/overview");
  if (!response.ok) {
    throw new Error(`Failed to load overview (status ${response.status})`);
  }
  return (await response.json()) as DatabaseOverview;
}
