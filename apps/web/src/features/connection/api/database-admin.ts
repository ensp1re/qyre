import type { ConnectResponse } from "@qyre/core";
import { fetchJson } from "../../../shared/api/fetch-json.js";

export async function listDatabases(): Promise<string[]> {
  const { databases } = await fetchJson<{ databases: string[] }>("/api/databases");
  return databases;
}

export function createDatabase(database: string): Promise<{ database: string }> {
  return fetchJson("/api/databases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ database })
  });
}

export function dropDatabase(database: string): Promise<null> {
  return fetchJson(`/api/databases/${encodeURIComponent(database)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmedName: database })
  });
}

export function createSchema(schema: string): Promise<{ schema: string }> {
  return fetchJson("/api/schemas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schema })
  });
}

export function dropSchema(schema: string): Promise<null> {
  return fetchJson(`/api/schemas/${encodeURIComponent(schema)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmedName: schema })
  });
}

export function switchDatabase(database: string): Promise<ConnectResponse> {
  return fetchJson<ConnectResponse>("/api/connect/database", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ database })
  });
}
