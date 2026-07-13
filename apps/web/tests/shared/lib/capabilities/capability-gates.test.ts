import type { ConnectionCapabilities, TablePermissions } from "@qyre/core";
import { describe, expect, it } from "vitest";
import {
  sessionAllows,
  tableAllows
} from "../../../../src/shared/lib/capabilities/capability-gates.js";

const WRITABLE: ConnectionCapabilities = {
  supportsSql: true,
  rowExportFormats: ["csv", "json", "sql"],
  jsonExportMode: "json",
  supportsRowMutations: true,
  supportsDdl: false,
  supportsIndexManagement: false,
  supportsDatabaseManagement: false,
  supportsTransactions: true,
  readOnlyReason: null
};

describe("sessionAllows (F097)", () => {
  it("reads the matching capability flag", () => {
    expect(sessionAllows(WRITABLE, "supportsRowMutations")).toBe(true);
    expect(sessionAllows(WRITABLE, "supportsDdl")).toBe(false);
  });

  it("gates closed when capabilities are undefined (still loading/disconnected)", () => {
    expect(sessionAllows(undefined, "supportsRowMutations")).toBe(false);
  });
});

describe("tableAllows (F097)", () => {
  const permissions: TablePermissions = {
    select: true,
    insert: true,
    update: false,
    delete: false
  };

  it("reads the matching per-table permission", () => {
    expect(tableAllows(permissions, "insert")).toBe(true);
    expect(tableAllows(permissions, "update")).toBe(false);
  });

  it("gates closed when permissions are undefined (engine hasn't attached them)", () => {
    expect(tableAllows(undefined, "insert")).toBe(false);
  });
});
