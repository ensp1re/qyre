import { describe, expect, it } from "vitest";
import {
  capabilitiesFromConnectionStatus,
  tablePermissionsFromConnectionStatus,
  type ConnectionStatusResult
} from "../src/access/permissions.js";

function status(
  authenticatedUsers: Array<{ user: string; db: string }>,
  authenticatedUserPrivileges?: ConnectionStatusResult["authInfo"]["authenticatedUserPrivileges"]
): ConnectionStatusResult {
  return { authInfo: { authenticatedUsers, authenticatedUserPrivileges } };
}

describe("capabilitiesFromConnectionStatus (F095)", () => {
  it("reports full access for an unauthenticated connection (mongod's own default with no auth)", () => {
    // Real shape, live-verified against an unauthenticated mongod: authenticatedUsers is empty and
    // authenticatedUserPrivileges is an empty array (not omitted).
    expect(capabilitiesFromConnectionStatus(status([], []))).toEqual({
      supportsSql: false,
      rowExportFormats: ["csv", "json"],
      jsonExportMode: "extended-json",
      supportsAccessInspection: true,
      supportsRowMutations: true,
      supportsDdl: true,
      supportsIndexManagement: true,
      supportsDatabaseManagement: true,
      supportsTransactions: false,
      readOnlyReason: null
    });
  });

  it("reports read-only for the built-in read role (db-wide find only, live-verified shape)", () => {
    const readRoleStatus = status(
      [{ user: "reader", db: "qyre_test" }],
      [
        {
          resource: { db: "qyre_test", collection: "system.js" },
          actions: ["find", "listIndexes"]
        },
        { resource: { db: "qyre_test", collection: "" }, actions: ["find", "listIndexes"] }
      ]
    );
    expect(capabilitiesFromConnectionStatus(readRoleStatus)).toEqual({
      supportsSql: false,
      rowExportFormats: ["csv", "json"],
      jsonExportMode: "extended-json",
      supportsAccessInspection: true,
      supportsRowMutations: false,
      supportsDdl: false,
      supportsIndexManagement: false,
      supportsDatabaseManagement: false,
      supportsTransactions: false,
      readOnlyReason: "grants"
    });
  });

  it("reports writability for the built-in readWrite role (live-verified shape)", () => {
    const readWriteStatus = status(
      [{ user: "writer", db: "qyre_test" }],
      [
        {
          resource: { db: "qyre_test", collection: "" },
          actions: ["find", "insert", "update", "remove", "createCollection", "createIndex"]
        }
      ]
    );
    expect(capabilitiesFromConnectionStatus(readWriteStatus)).toMatchObject({
      supportsRowMutations: true,
      supportsDdl: true,
      supportsIndexManagement: true,
      readOnlyReason: null
    });
  });

  it("derives supportsDatabaseManagement from the dropDatabase action (F115)", () => {
    const dbAdminStatus = status(
      [{ user: "dbadmin", db: "qyre_test" }],
      [{ resource: { db: "qyre_test", collection: "" }, actions: ["find", "dropDatabase"] }]
    );
    expect(capabilitiesFromConnectionStatus(dbAdminStatus)).toMatchObject({
      supportsDatabaseManagement: true,
      readOnlyReason: null
    });
    // The readWrite-role shape (no dropDatabase) stays false.
    const readWriteStatus = status(
      [{ user: "writer", db: "qyre_test" }],
      [{ resource: { db: "qyre_test", collection: "" }, actions: ["find", "insert"] }]
    );
    expect(capabilitiesFromConnectionStatus(readWriteStatus)).toMatchObject({
      supportsDatabaseManagement: false
    });
  });

  it("grants writability from an anyResource privilege", () => {
    const anyResourceStatus = status(
      [{ user: "admin", db: "admin" }],
      [{ resource: { anyResource: true }, actions: ["insert"] }]
    );
    expect(capabilitiesFromConnectionStatus(anyResourceStatus)).toMatchObject({
      supportsRowMutations: true,
      readOnlyReason: null
    });
  });

  it("ignores a privilege scoped only to a system database or system collection", () => {
    const systemOnlyStatus = status(
      [{ user: "sysuser", db: "admin" }],
      [
        { resource: { db: "admin", collection: "" }, actions: ["insert", "createCollection"] },
        { resource: { db: "qyre_test", collection: "system.profile" }, actions: ["insert"] }
      ]
    );
    expect(capabilitiesFromConnectionStatus(systemOnlyStatus)).toMatchObject({
      supportsRowMutations: false,
      supportsDdl: false,
      readOnlyReason: "grants"
    });
  });

  it("degrades to read-only when authenticatedUserPrivileges is absent", () => {
    expect(
      capabilitiesFromConnectionStatus(status([{ user: "x", db: "qyre_test" }], undefined))
    ).toMatchObject({ supportsRowMutations: false, readOnlyReason: "grants" });
  });
});

describe("tablePermissionsFromConnectionStatus (F095)", () => {
  it("grants every mutation for an unauthenticated connection", () => {
    expect(tablePermissionsFromConnectionStatus(status([], []), "qyre_test", "users")).toEqual({
      select: true,
      insert: true,
      update: true,
      delete: true
    });
  });

  it("reports select-only for a db-wide read grant", () => {
    const readRoleStatus = status(
      [{ user: "reader", db: "qyre_test" }],
      [{ resource: { db: "qyre_test", collection: "" }, actions: ["find"] }]
    );
    expect(tablePermissionsFromConnectionStatus(readRoleStatus, "qyre_test", "orders")).toEqual({
      select: true,
      insert: false,
      update: false,
      delete: false
    });
  });

  it("reports per-collection permissions from a collection-specific grant", () => {
    const scopedStatus = status(
      [{ user: "scoped", db: "qyre_test" }],
      [{ resource: { db: "qyre_test", collection: "orders" }, actions: ["find", "insert"] }]
    );
    expect(tablePermissionsFromConnectionStatus(scopedStatus, "qyre_test", "orders")).toEqual({
      select: true,
      insert: true,
      update: false,
      delete: false
    });
    // A different collection in the same db gets nothing from a collection-specific grant.
    expect(tablePermissionsFromConnectionStatus(scopedStatus, "qyre_test", "users")).toEqual({
      select: false,
      insert: false,
      update: false,
      delete: false
    });
  });

  it("does not let a grant on a different database leak into this one", () => {
    const otherDbStatus = status(
      [{ user: "other", db: "other_db" }],
      [
        {
          resource: { db: "other_db", collection: "" },
          actions: ["find", "insert", "update", "remove"]
        }
      ]
    );
    expect(tablePermissionsFromConnectionStatus(otherDbStatus, "qyre_test", "users")).toEqual({
      select: false,
      insert: false,
      update: false,
      delete: false
    });
  });
});
