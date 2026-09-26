// @vitest-environment jsdom
import type { TableMetadata } from "@qyre/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePendingChanges } from "../../../../src/features/table/model/editing/pending-changes.js";
import { TablesTab } from "../../../../src/features/table/ui/tables-tab.js";

const commitMutations = vi.hoisted(() => vi.fn());
vi.mock("../../../../src/features/table/api/mutations.js", () => ({ commitMutations }));

const tableData: TableMetadata = {
  schema: "public",
  name: "users",
  kind: "table",
  columns: [
    { name: "id", dataType: "int4", nullable: false, isPrimaryKey: true, isForeignKey: false },
    { name: "name", dataType: "text", nullable: true, isPrimaryKey: false, isForeignKey: false }
  ],
  indexes: []
};

function Host({
  page = 0,
  hasMore = false,
  isPlaceholderData = false
}: {
  page?: number;
  hasMore?: boolean;
  isPlaceholderData?: boolean;
}): ReactNode {
  const pendingChanges = usePendingChanges("users");
  const { addInsert } = pendingChanges;
  useEffect(() => {
    addInsert({ name: "Ada" });
  }, [addInsert]);
  return (
    <TablesTab
      selected={{ schema: "public", table: "users" }}
      table={{ isLoading: false, isError: false, data: tableData } as never}
      engine="postgres"
      rows={
        {
          isLoading: false,
          isError: false,
          isFetching: false,
          isPlaceholderData,
          data: {
            rowPage: { columns: ["id", "name"], rows: [], page, pageSize: 25 },
            hasMore
          },
          refetch: vi.fn()
        } as never
      }
      pendingChanges={pendingChanges}
      page={page}
      onPageChange={vi.fn()}
      sort={undefined}
      onSortChange={vi.fn()}
      filters={undefined}
      onFiltersChange={vi.fn()}
      search={undefined}
      onSearchChange={vi.fn()}
    />
  );
}

function renderHost(props: Parameters<typeof Host>[0] = {}): void {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Host {...props} />
    </QueryClientProvider>
  );
}

function pressSave(): void {
  fireEvent.keyDown(window, { key: "s", ctrlKey: true });
}

describe("TablesTab", () => {
  beforeEach(() => {
    localStorage.clear();
    commitMutations.mockReset();
  });
  afterEach(cleanup);

  it("commits the current buffer once from the Structure view even when pressed twice", async () => {
    let resolveCommit: (value: unknown) => void = () => {};
    commitMutations.mockReturnValue(new Promise((resolve) => (resolveCommit = resolve)));
    renderHost();

    fireEvent.click(screen.getByRole("button", { name: "Structure" }));
    pressSave();
    pressSave();

    expect(commitMutations).toHaveBeenCalledTimes(1);
    expect(commitMutations.mock.calls[0]?.[0]).toEqual([
      { type: "insert", schema: "public", table: "users", values: { name: "Ada" } }
    ]);
    await act(async () => resolveCommit({ committed: true }));
    pressSave();
    expect(commitMutations).toHaveBeenCalledTimes(1);
  });

  it("disables Next while the previous page is shown as placeholder data", () => {
    renderHost({ page: 1, hasMore: true, isPlaceholderData: true });
    expect(screen.getByRole("button", { name: "Next page" })).toHaveProperty("disabled", true);
  });

  it("enables paging once the requested page has loaded", () => {
    renderHost({ page: 1, hasMore: true });
    expect(screen.getByRole("button", { name: "Next page" })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Previous page" })).toHaveProperty("disabled", false);
  });
});
