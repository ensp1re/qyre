// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { useTableDdlMutations } from "../../../../../src/features/table/model/structure/use-table-ddl.js";

vi.mock("../../../../../src/features/table/api/table-ddl.js", () => ({
  addColumn: vi.fn(async () => undefined),
  createIndex: vi.fn(async () => undefined),
  dropColumn: vi.fn(async () => undefined),
  dropIndex: vi.fn(async () => undefined),
  dropTable: vi.fn(async () => undefined),
  renameTable: vi.fn(async () => undefined),
  truncateTable: vi.fn(async () => undefined),
  updateColumn: vi.fn(async () => ({ column: "full_name" }))
}));

function setup() {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const { result } = renderHook(() => useTableDdlMutations("public", "users"), { wrapper });
  const invalidatedKeys = () => invalidate.mock.calls.map(([filters]) => filters?.queryKey);
  return { ddl: result.current, invalidatedKeys };
}

describe("useTableDdlMutations", () => {
  it.each([
    [
      "addColumn",
      (ddl: ReturnType<typeof useTableDdlMutations>) =>
        ddl.addColumn({ name: "age", dataType: "int4", nullable: true, default: null })
    ],
    [
      "editColumn",
      (ddl: ReturnType<typeof useTableDdlMutations>) =>
        ddl.editColumn("name", { newName: "full_name" })
    ],
    ["dropColumn", (ddl: ReturnType<typeof useTableDdlMutations>) => ddl.dropColumn("name")]
  ])("%s refreshes the table's cached rows as well as its metadata", async (_name, run) => {
    const { ddl, invalidatedKeys } = setup();
    await run(ddl);
    expect(invalidatedKeys()).toEqual(
      expect.arrayContaining([
        ["table", "public", "users"],
        ["rows", "public", "users"]
      ])
    );
  });
});
