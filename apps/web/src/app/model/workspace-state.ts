import type { RowFilter, RowSort } from "@qyre/core";
import type { ShellTab } from "@qyre/ui";

export interface SelectedTable {
  schema: string;
  table: string;
}

export interface WorkspaceState {
  selected?: SelectedTable;
  page: number;
  sort?: RowSort;
  filters?: RowFilter[];
  querySql: string;
  tab: ShellTab;
  sidebarOpen: boolean;
  lastQueryMs?: number;
  selectedFilePath?: string;
  historyOpen: boolean;
  connectOpen: boolean;
  hasAutoOpenedConnect: boolean;
}

export type WorkspaceAction =
  | { type: "tableSelected"; selected: SelectedTable; filters?: RowFilter[] }
  | { type: "pageChanged"; page: number }
  | { type: "sortChanged"; sort?: RowSort }
  | { type: "filtersChanged"; filters?: RowFilter[] }
  | { type: "queryChanged"; sql: string }
  | { type: "queryLoaded"; sql: string }
  | { type: "tabChanged"; tab: ShellTab }
  | { type: "sidebarChanged"; open: boolean }
  | { type: "queryCompleted"; durationMs: number }
  | { type: "fileSelected"; path?: string }
  | { type: "historyChanged"; open: boolean }
  | { type: "historySelected"; sql: string }
  | { type: "connectChanged"; open: boolean }
  | { type: "connectAutoOpened" }
  | { type: "connectionChanged" }
  | { type: "sqlUnavailableForConnection" };

export function createInitialWorkspaceState(viewportWidth: number): WorkspaceState {
  return {
    page: 0,
    querySql: "",
    tab: "sql-editor",
    sidebarOpen: viewportWidth >= 768,
    historyOpen: false,
    connectOpen: false,
    hasAutoOpenedConnect: false
  };
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "tableSelected":
      return {
        ...state,
        selected: action.selected,
        page: 0,
        sort: undefined,
        filters: action.filters,
        tab: "tables"
      };
    case "pageChanged":
      return { ...state, page: action.page };
    case "sortChanged":
      return { ...state, sort: action.sort, page: 0 };
    case "filtersChanged":
      return { ...state, filters: action.filters, page: 0 };
    case "queryChanged":
      return { ...state, querySql: action.sql };
    case "queryLoaded":
      return { ...state, querySql: action.sql, tab: "sql-editor" };
    case "tabChanged":
      return { ...state, tab: action.tab };
    case "sidebarChanged":
      return { ...state, sidebarOpen: action.open };
    case "queryCompleted":
      return { ...state, lastQueryMs: action.durationMs };
    case "fileSelected":
      return { ...state, selectedFilePath: action.path };
    case "historyChanged":
      return { ...state, historyOpen: action.open };
    case "historySelected":
      return { ...state, querySql: action.sql, historyOpen: false };
    case "connectChanged":
      return { ...state, connectOpen: action.open };
    case "connectAutoOpened":
      return { ...state, connectOpen: true, hasAutoOpenedConnect: true };
    case "connectionChanged":
      return {
        ...state,
        selected: undefined,
        page: 0,
        sort: undefined,
        filters: undefined,
        selectedFilePath: undefined,
        lastQueryMs: undefined,
        connectOpen: false
      };
    case "sqlUnavailableForConnection":
      return state.tab === "sql-editor" ? { ...state, tab: "tables" } : state;
  }
}
