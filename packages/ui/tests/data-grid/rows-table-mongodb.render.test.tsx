import type { ColumnMetadata, RowPage } from "@qyre/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RowsTable } from "../../src/data-grid/table/rows-table.js";

const rowPage: RowPage = {
  columns: ["_id", "name", "profile"],
  rows: [
    {
      _id: "507f1f77bcf86cd799439011",
      name: "Ada",
      profile: { tags: ["admin"] }
    }
  ],
  page: 0,
  pageSize: 25
};

const columns: ColumnMetadata[] = [
  { name: "_id", dataType: "objectId", nullable: false, isPrimaryKey: true, isForeignKey: false },
  { name: "name", dataType: "string", nullable: false, isPrimaryKey: false, isForeignKey: false },
  {
    name: "profile",
    dataType: "object",
    nullable: true,
    isPrimaryKey: false,
    isForeignKey: false
  }
];

describe("RowsTable shared MongoDB editing", () => {
  it("uses Add row, Duplicate row, and typed cell editing instead of document actions", () => {
    const addInsert = vi.fn(() => "insert-0");
    render(
      <RowsTable
        rowPage={rowPage}
        columns={columns}
        engine="mongodb"
        page={0}
        canGoPrevious={false}
        canGoNext={false}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        editable
        editableColumns={new Set(["name", "profile"])}
        primaryKeyColumns={["_id"]}
        pendingChanges={{
          getEdit: () => undefined,
          stageEdit: vi.fn(),
          revertEdit: vi.fn(),
          inserts: [],
          addInsert,
          updateInsertValue: vi.fn(),
          removeInsert: vi.fn(),
          deletes: new Set(),
          stageDelete: vi.fn(),
          unstageDelete: vi.fn()
        }}
        canInsert
        insertableColumns={new Set(["_id", "name", "profile"])}
        canDelete
      />
    );

    expect(screen.queryByRole("button", { name: /insert document/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add row" }));
    expect(addInsert).toHaveBeenCalledWith();

    fireEvent.click(screen.getByRole("button", { name: "Duplicate row 1" }));
    expect(addInsert).toHaveBeenLastCalledWith({ name: "Ada", profile: { tags: ["admin"] } });

    const nameCell = screen.getByRole("button", { name: "Ada" });
    fireEvent.doubleClick(nameCell);
    expect(screen.getByRole("textbox", { name: "name" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit profile" })).toBeInTheDocument();
  });
});
