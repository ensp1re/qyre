import type mysql from "mysql2/promise";
import { describe, expect, it, vi } from "vitest";
import { inspectAccess } from "../src/access/access.js";

describe("inspectAccess", () => {
  it("reports active roles and redacts authentication clauses from SHOW GRANTS", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith("SELECT")) {
        return [[{ currentUser: "app@%", sessionUser: "app@localhost", currentRole: "reader@%" }]];
      }
      return [[{ grant: "GRANT USAGE ON *.* TO `app`@`%` IDENTIFIED BY PASSWORD 'secret'" }]];
    });
    const result = await inspectAccess({ query } as unknown as mysql.Pool);
    expect(result.roles).toEqual([
      { name: "reader@%", isCurrent: true, attributes: ["active role"] }
    ]);
    expect(result.grants[0]).toBe(
      "GRANT USAGE ON *.* TO `app`@`%` [authentication details redacted]"
    );
    expect(result.facts).toContainEqual({ label: "Current roles", value: "reader@%" });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("degrades when SHOW GRANTS is restricted", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith("SELECT")) {
        return [[{ currentUser: "app@%", sessionUser: "app@localhost", currentRole: "NONE" }]];
      }
      throw new Error("denied");
    });
    const result = await inspectAccess({ query } as unknown as mysql.Pool);
    expect(result.grants).toEqual([]);
    expect(result.notices).toContain("Grant inspection is restricted for this MySQL session.");
  });
});
