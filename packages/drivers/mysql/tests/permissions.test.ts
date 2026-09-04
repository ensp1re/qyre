import type mysql from "mysql2/promise";
import { describe, expect, it, vi } from "vitest";
import {
  fetchAllTablePermissions,
  fetchConnectionCapabilities,
  fetchTablePermissions
} from "../src/access/permissions.js";

/** Match fake pool responses by query because the implementation runs requests in parallel. */
function fakePool(opts: {
  grantLines: string[];
  isGlobalReadOnly?: boolean;
  isSessionReadOnly?: boolean;
  tables?: Array<{ table_schema: string; table_name: string }>;
}): mysql.Pool {
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith("SHOW GRANTS")) {
      return [opts.grantLines.map((line) => ({ "Grants for x@%": line }))];
    }
    if (sql.includes("@@global.read_only")) {
      return [
        [
          {
            is_global_read_only: opts.isGlobalReadOnly ? 1 : 0,
            is_session_read_only: opts.isSessionReadOnly ? 1 : 0
          }
        ]
      ];
    }
    if (sql.includes("information_schema.tables")) {
      return [opts.tables ?? []];
    }
    throw new Error(`fakePool: unexpected query: ${sql}`);
  });
  return { query } as unknown as mysql.Pool;
}

describe("fetchTablePermissions (F093)", () => {
  it("reports a direct single-table grant", async () => {
    const pool = fakePool({
      grantLines: [
        "GRANT USAGE ON *.* TO `bob`@`%`",
        "GRANT SELECT ON `qyre_test`.`users` TO `bob`@`%`"
      ]
    });
    await expect(fetchTablePermissions(pool, "qyre_test", "users")).resolves.toEqual({
      select: true,
      insert: false,
      update: false,
      delete: false
    });
  });

  it("reports a schema-wide (db.*) grant as applying to every table in that schema", async () => {
    const pool = fakePool({
      grantLines: ["GRANT SELECT, INSERT, UPDATE, DELETE ON `qyre_test`.* TO `bob`@`%`"]
    });
    await expect(fetchTablePermissions(pool, "qyre_test", "anything")).resolves.toEqual({
      select: true,
      insert: true,
      update: true,
      delete: true
    });
  });

  it("reports a role-derived grant the same way, since SHOW GRANTS already merged it in (F093)", async () => {
    const pool = fakePool({
      grantLines: [
        "GRANT USAGE ON *.* TO `writer`@`%`",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON `qyre_test`.* TO `writer`@`%`",
        "GRANT `qyre_writer_role`@`%` TO `writer`@`%`"
      ]
    });
    await expect(fetchTablePermissions(pool, "qyre_test", "orders")).resolves.toEqual({
      select: true,
      insert: true,
      update: true,
      delete: true
    });
  });

  it("does not let a role-assignment line (no ON clause) grant anything by accident", async () => {
    const pool = fakePool({
      grantLines: ["GRANT USAGE ON *.* TO `bob`@`%`", "GRANT `some_role`@`%` TO `bob`@`%`"]
    });
    await expect(fetchTablePermissions(pool, "qyre_test", "users")).resolves.toEqual(
      expect.objectContaining({ select: false, insert: false, update: false, delete: false })
    );
  });

  it("treats ALL PRIVILEGES as implying select/insert/update/delete", async () => {
    const pool = fakePool({ grantLines: ["GRANT ALL PRIVILEGES ON *.* TO `root`@`%`"] });
    await expect(fetchTablePermissions(pool, "qyre_test", "users")).resolves.toEqual({
      select: true,
      insert: true,
      update: true,
      delete: true
    });
  });

  it("does not let a grant on a different schema leak into this one", async () => {
    const pool = fakePool({
      grantLines: ["GRANT SELECT, INSERT, UPDATE, DELETE ON `other_db`.* TO `bob`@`%`"]
    });
    await expect(fetchTablePermissions(pool, "qyre_test", "users")).resolves.toEqual(
      expect.objectContaining({ select: false, insert: false, update: false, delete: false })
    );
  });
});

describe("fetchAllTablePermissions (F093)", () => {
  it("computes permissions for every non-system table from one shared grant list", async () => {
    const pool = fakePool({
      grantLines: ["GRANT SELECT ON `qyre_test`.* TO `bob`@`%`"],
      tables: [
        { table_schema: "qyre_test", table_name: "users" },
        { table_schema: "qyre_test", table_name: "orders" }
      ]
    });
    const permissions = await fetchAllTablePermissions(pool);
    expect(permissions.get(JSON.stringify(["qyre_test", "users"]))).toEqual({
      select: true,
      insert: false,
      update: false,
      delete: false
    });
    expect(permissions.get(JSON.stringify(["qyre_test", "orders"]))).toEqual({
      select: true,
      insert: false,
      update: false,
      delete: false
    });
  });
});

describe("fetchConnectionCapabilities (F093)", () => {
  it("reports full writability for a superuser-equivalent (ALL PRIVILEGES) session", async () => {
    await expect(
      fetchConnectionCapabilities(
        fakePool({ grantLines: ["GRANT ALL PRIVILEGES ON *.* TO `root`@`%` WITH GRANT OPTION"] })
      )
    ).resolves.toEqual({
      supportsSql: true,
      rowExportFormats: ["csv", "json", "sql"],
      jsonExportMode: "json",
      supportsAccessInspection: true,
      supportsRowMutations: true,
      supportsDdl: true,
      supportsIndexManagement: true,
      supportsDatabaseManagement: true,
      supportsTransactions: true,
      readOnlyReason: null
    });
  });

  it("reports read-only (grants) for a SELECT-only session", async () => {
    await expect(
      fetchConnectionCapabilities(
        fakePool({ grantLines: ["GRANT SELECT ON `qyre_test`.* TO `ro`@`%`"] })
      )
    ).resolves.toEqual({
      supportsSql: true,
      rowExportFormats: ["csv", "json", "sql"],
      jsonExportMode: "json",
      supportsAccessInspection: true,
      supportsRowMutations: false,
      supportsDdl: false,
      supportsIndexManagement: false,
      supportsDatabaseManagement: false,
      supportsTransactions: false,
      readOnlyReason: "grants"
    });
  });

  it("reports read-only (replica) when @@global.read_only is set, even with write grants", async () => {
    await expect(
      fetchConnectionCapabilities(
        fakePool({
          grantLines: ["GRANT ALL PRIVILEGES ON *.* TO `root`@`%`"],
          isGlobalReadOnly: true
        })
      )
    ).resolves.toMatchObject({ supportsRowMutations: false, readOnlyReason: "replica" });
  });

  it("reports read-only (connection) when only the session's transaction_read_only is set", async () => {
    await expect(
      fetchConnectionCapabilities(
        fakePool({
          grantLines: ["GRANT ALL PRIVILEGES ON *.* TO `root`@`%`"],
          isSessionReadOnly: true
        })
      )
    ).resolves.toMatchObject({ supportsRowMutations: false, readOnlyReason: "connection" });
  });

  it("grants row-mutation capability from a schema-wide INSERT/UPDATE/DELETE grant alone", async () => {
    await expect(
      fetchConnectionCapabilities(
        fakePool({ grantLines: ["GRANT INSERT, UPDATE, DELETE ON `qyre_test`.* TO `writer`@`%`"] })
      )
    ).resolves.toMatchObject({
      supportsRowMutations: true,
      supportsDdl: false,
      readOnlyReason: null
    });
  });
});
