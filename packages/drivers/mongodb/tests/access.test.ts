import type { MongoClient } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { inspectAccess } from "../src/access/access.js";

describe("inspectAccess", () => {
  it("uses usersInfo and rolesInfo without requesting credentials", async () => {
    const command = vi.fn(async (request: Record<string, unknown>) => {
      if (request.connectionStatus) {
        return {
          authInfo: {
            authenticatedUsers: [{ user: "app", db: "admin" }],
            authenticatedUserPrivileges: [
              { resource: { db: "qyre", collection: "users" }, actions: ["find"] }
            ]
          }
        };
      }
      if (request.usersInfo) {
        expect(request.showCredentials).toBe(false);
        return { users: [{ roles: [{ role: "read", db: "qyre" }] }] };
      }
      return { roles: [{ inheritedRoles: [{ role: "base", db: "qyre" }] }] };
    });
    const client = { db: vi.fn(() => ({ command })) } as unknown as MongoClient;
    const result = await inspectAccess(client);
    expect(result.identity).toBe("app@admin");
    expect(result.roles[0]).toEqual({
      name: "read@qyre",
      isCurrent: true,
      attributes: ["assigned role", "inherits base@qyre"]
    });
    expect(result.grants).toEqual(["find on qyre.users"]);
  });

  it("keeps the identity when role catalogs are restricted", async () => {
    const command = vi.fn(async (request: Record<string, unknown>) => {
      if (request.connectionStatus) {
        return { authInfo: { authenticatedUsers: [{ user: "app", db: "admin" }] } };
      }
      throw new Error("not authorized");
    });
    const client = { db: vi.fn(() => ({ command })) } as unknown as MongoClient;
    const result = await inspectAccess(client);
    expect(result.identity).toBe("app@admin");
    expect(result.roles).toEqual([]);
    expect(result.notices).toEqual(["Role details are restricted for one or more identities."]);
  });
});
