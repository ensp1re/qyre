import {
  createInitialWorkspaceState,
  workspaceReducer
} from "../../../src/app/model/workspace-state.js";
import { describe, expect, it } from "vitest";

describe("workspaceReducer", () => {
  it("selects a table and resets table navigation atomically", () => {
    const initial = {
      ...createInitialWorkspaceState(1200),
      page: 4,
      sort: { column: "name", direction: "asc" as const }
    };

    const next = workspaceReducer(initial, {
      type: "tableSelected",
      selected: { schema: "public", table: "users" },
      filters: [{ column: "id", op: "eq", value: "1" }]
    });

    expect(next).toMatchObject({
      selected: { schema: "public", table: "users" },
      page: 0,
      sort: undefined,
      tab: "tables"
    });
    expect(next.filters).toHaveLength(1);
  });

  it("resets database-owned navigation without discarding the SQL draft", () => {
    const initial = {
      ...createInitialWorkspaceState(1200),
      selected: { schema: "public", table: "users" },
      page: 2,
      querySql: "SELECT * FROM users",
      connectOpen: true
    };

    expect(workspaceReducer(initial, { type: "connectionChanged" })).toMatchObject({
      selected: undefined,
      page: 0,
      querySql: "SELECT * FROM users",
      connectOpen: false
    });
  });

  it("loads a query and returns to the SQL editor", () => {
    const initial = { ...createInitialWorkspaceState(500), tab: "files" as const };
    const next = workspaceReducer(initial, { type: "queryLoaded", sql: "SELECT 1" });

    expect(next.querySql).toBe("SELECT 1");
    expect(next.tab).toBe("sql-editor");
    expect(next.sidebarOpen).toBe(false);
  });
});
