import {
  MAX_ACCESS_GRANTS,
  MAX_ACCESS_ROLES,
  type AccessOverview,
  type AccessRole
} from "@qyre/core";
import type { Pool } from "pg";

const ROLE_NOTICE = "Role catalog access is restricted; role details are unavailable.";
const GRANT_NOTICE = "Grant catalog access is restricted; grant details are unavailable.";

export async function inspectAccess(pool: Pool): Promise<AccessOverview> {
  const identityResult = await pool.query<{ current_user: string; session_user: string }>(
    "SELECT current_user AS current_user, session_user AS session_user"
  );
  const identityRow = identityResult.rows[0];
  if (!identityRow) throw new Error("Could not read the PostgreSQL session identity.");
  const notices: string[] = [];
  let roles: AccessRole[] = [];
  let grants: string[] = [];

  try {
    const result = await pool.query<{
      rolname: string;
      rolsuper: boolean;
      rolinherit: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
      rolcanlogin: boolean;
      rolreplication: boolean;
      rolbypassrls: boolean;
    }>(
      `SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin,
              rolreplication, rolbypassrls
         FROM pg_roles
        ORDER BY rolname
        LIMIT $1`,
      [MAX_ACCESS_ROLES + 1]
    );
    if (result.rows.length > MAX_ACCESS_ROLES) notices.push("Roles were truncated to 500 entries.");
    roles = result.rows.slice(0, MAX_ACCESS_ROLES).map((role) => ({
      name: role.rolname,
      isCurrent: role.rolname === identityRow.current_user,
      attributes: [
        role.rolsuper && "superuser",
        role.rolinherit && "inherit",
        role.rolcreaterole && "create role",
        role.rolcreatedb && "create database",
        role.rolcanlogin && "login",
        role.rolreplication && "replication",
        role.rolbypassrls && "bypass row security"
      ].filter((value): value is string => Boolean(value))
    }));
  } catch {
    notices.push(ROLE_NOTICE);
  }

  try {
    const result = await pool.query<{
      privilege_type: string;
      table_schema: string;
      table_name: string;
      grantee: string;
    }>(
      `SELECT privilege_type, table_schema, table_name, grantee
         FROM information_schema.role_table_grants
        WHERE grantee IN (SELECT role_name FROM information_schema.enabled_roles)
        ORDER BY table_schema, table_name, privilege_type, grantee
        LIMIT $1`,
      [MAX_ACCESS_GRANTS + 1]
    );
    if (result.rows.length > MAX_ACCESS_GRANTS)
      notices.push("Grants were truncated to 1000 entries.");
    grants = result.rows
      .slice(0, MAX_ACCESS_GRANTS)
      .map(
        (grant) =>
          `${grant.privilege_type} on ${grant.table_schema}.${grant.table_name}${
            grant.grantee === identityRow.current_user ? "" : ` via ${grant.grantee}`
          }`
      );
  } catch {
    notices.push(GRANT_NOTICE);
  }

  return {
    identity: identityRow.current_user,
    roles,
    grants,
    facts: [
      { label: "Session user", value: identityRow.session_user },
      { label: "Current user", value: identityRow.current_user }
    ],
    notices
  };
}
