import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { inspectAccess } from "../src/access/access.js";

describe("inspectAccess", () => {
  it("returns whitelisted role attributes and effective table grants", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("session_user")) {
        return { rows: [{ current_user: "app", session_user: "login" }] };
      }
      if (sql.includes("pg_roles")) {
        return {
          rows: [
            {
              rolname: "app",
              rolsuper: false,
              rolinherit: true,
              rolcreaterole: false,
              rolcreatedb: false,
              rolcanlogin: true,
              rolreplication: false,
              rolbypassrls: false
            }
          ]
        };
      }
      return {
        rows: [
          {
            privilege_type: "SELECT",
            table_schema: "public",
            table_name: "users",
            grantee: "app"
          }
        ]
      };
    });
    const result = await inspectAccess({ query } as unknown as Pool);
    expect(result.identity).toBe("app");
    expect(result.roles).toEqual([
      { name: "app", isCurrent: true, attributes: ["inherit", "login"] }
    ]);
    expect(result.grants).toEqual(["SELECT on public.users"]);
  });

  it("degrades a restricted role catalog without losing identity or grants", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("session_user")) {
        return { rows: [{ current_user: "app", session_user: "app" }] };
      }
      if (sql.includes("pg_roles")) throw new Error("permission denied: secret detail");
      return { rows: [] };
    });
    const result = await inspectAccess({ query } as unknown as Pool);
    expect(result.identity).toBe("app");
    expect(result.roles).toEqual([]);
    expect(result.notices).toEqual([
      "Role catalog access is restricted; role details are unavailable."
    ]);
    expect(JSON.stringify(result)).not.toContain("secret detail");
  });

  it("bounds role and grant catalogs with explicit notices", async () => {
    const role = {
      rolname: "role",
      rolsuper: false,
      rolinherit: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolcanlogin: false,
      rolreplication: false,
      rolbypassrls: false
    };
    const grant = {
      privilege_type: "SELECT",
      table_schema: "public",
      table_name: "users",
      grantee: "app"
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("session_user")) {
        return { rows: [{ current_user: "app", session_user: "app" }] };
      }
      return sql.includes("pg_roles")
        ? {
            rows: Array.from({ length: 501 }, (_, index) => ({ ...role, rolname: `role_${index}` }))
          }
        : { rows: Array.from({ length: 1001 }, () => grant) };
    });
    const result = await inspectAccess({ query } as unknown as Pool);
    expect(result.roles).toHaveLength(500);
    expect(result.grants).toHaveLength(1000);
    expect(result.notices).toEqual([
      "Roles were truncated to 500 entries.",
      "Grants were truncated to 1000 entries."
    ]);
  });
});
