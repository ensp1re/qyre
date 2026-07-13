import type { ConnectResponse } from "@qyre/core";
import { fetchJson } from "../../../shared/api/fetch-json.js";

/** Lists sibling databases on the current server (F115/F116). */
export async function listDatabases(): Promise<string[]> {
  const { databases } = await fetchJson<{ databases: string[] }>("/api/databases");
  return databases;
}

/** Creates a database (F115/F116). */
export function createDatabase(database: string): Promise<{ database: string }> {
  return fetchJson("/api/databases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ database })
  });
}

/** Drops a database (F115/F116). `confirmedName` is always `database` itself - by the time
 * `ConfirmTypedNameDialog`'s onConfirm fires, the typed text has already been verified to match
 * client-side. */
export function dropDatabase(database: string): Promise<null> {
  return fetchJson(`/api/databases/${encodeURIComponent(database)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmedName: database })
  });
}

/** Creates a schema (F115/F116, Postgres only). */
export function createSchema(schema: string): Promise<{ schema: string }> {
  return fetchJson("/api/schemas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schema })
  });
}

/** Drops a schema (F115/F116, Postgres only) - see {@link dropDatabase} for the `confirmedName`
 * rationale. */
export function dropSchema(schema: string): Promise<null> {
  return fetchJson(`/api/schemas/${encodeURIComponent(schema)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmedName: schema })
  });
}

/** Switches to a sibling database on the current server (F116) - reuses the current connection's
 * own credentials server-side, the client only ever names the database. */
export function switchDatabase(database: string): Promise<ConnectResponse> {
  return fetchJson<ConnectResponse>("/api/connect/database", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ database })
  });
}
