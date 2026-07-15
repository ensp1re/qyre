import {
  MAX_ACCESS_GRANTS,
  MAX_ACCESS_ROLES,
  type AccessOverview,
  type AccessRole
} from "@qyre/core";
import type mysql from "mysql2/promise";
import { fetchGrantLines } from "./permissions.js";

function redactGrant(line: string): string {
  const sensitive = /\s+(IDENTIFIED|PASSWORD|AUTHENTICATION_STRING)\b/i.exec(line);
  return sensitive ? `${line.slice(0, sensitive.index)} [authentication details redacted]` : line;
}

function roleNames(currentRole: string | null): string[] {
  if (!currentRole || currentRole.toUpperCase() === "NONE") return [];
  return currentRole
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);
}

export async function inspectAccess(pool: mysql.Pool): Promise<AccessOverview> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT CURRENT_USER() AS currentUser, USER() AS sessionUser, CURRENT_ROLE() AS currentRole"
  );
  const row = rows[0] as
    { currentUser: string; sessionUser: string; currentRole: string | null } | undefined;
  if (!row) throw new Error("Could not read the MySQL session identity.");
  const notices: string[] = [];
  let grants: string[] = [];
  try {
    const lines = await fetchGrantLines(pool);
    if (lines.length > MAX_ACCESS_GRANTS) notices.push("Grants were truncated to 1000 entries.");
    grants = lines.slice(0, MAX_ACCESS_GRANTS).map(redactGrant);
  } catch {
    notices.push("Grant inspection is restricted for this MySQL session.");
  }
  const names = roleNames(row.currentRole).sort();
  if (names.length > MAX_ACCESS_ROLES) notices.push("Roles were truncated to 500 entries.");
  const roles: AccessRole[] = names.slice(0, MAX_ACCESS_ROLES).map((name) => ({
    name,
    isCurrent: true,
    attributes: ["active role"]
  }));
  return {
    identity: row.currentUser,
    roles,
    grants: grants.sort(),
    facts: [
      { label: "Authenticated account", value: row.currentUser },
      { label: "Client identity", value: row.sessionUser },
      { label: "Current roles", value: row.currentRole ?? "NONE" }
    ],
    notices
  };
}
