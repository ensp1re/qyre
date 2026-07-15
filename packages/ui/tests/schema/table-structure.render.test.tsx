import type { TableMetadata } from "@qyre/core";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  TableStructure,
  type TableStructureProps
} from "../../src/schema/structure/table-structure.js";

const POSTGRES_COLUMN_TYPES = ["text", "integer", "boolean"] as const;

function makeTable(overrides: Partial<TableMetadata> = {}): TableMetadata {
  return {
    schema: "public",
    name: "orders",
    kind: "table",
    columns: [
      {
        name: "id",
        dataType: "integer",
        nullable: false,
        isPrimaryKey: true,
        isForeignKey: false
      },
      { name: "email", dataType: "text", nullable: true, isPrimaryKey: false, isForeignKey: false }
    ],
    indexes: [
      { name: "orders_pkey", columns: ["id"], unique: true, primary: true },
      { name: "orders_email_idx", columns: ["email"], unique: false, primary: false }
    ],
    ...overrides
  };
}

function makeProps(overrides: Partial<TableStructureProps> = {}): TableStructureProps {
  return {
    table: makeTable(),
    engine: "postgres",
    columnTypes: POSTGRES_COLUMN_TYPES,
    canEditColumns: true,
    canManageIndexes: true,
    canEditTable: true,
    onAddColumn: vi.fn().mockResolvedValue(undefined),
    onEditColumn: vi.fn().mockResolvedValue(undefined),
    onDropColumn: vi.fn().mockResolvedValue(undefined),
    onCreateIndex: vi.fn().mockResolvedValue(undefined),
    onDropIndex: vi.fn().mockResolvedValue(undefined),
    onRenameTable: vi.fn().mockResolvedValue(undefined),
    onTruncateTable: vi.fn().mockResolvedValue(undefined),
    onDropTable: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

describe("TableStructure (component rendering, F114)", () => {
  it("falls back to the read-only TableDetail for a view", () => {
    render(<TableStructure {...makeProps({ table: makeTable({ kind: "view" }) })} />);
    expect(screen.getByTestId("table-detail")).toBeInTheDocument();
    expect(screen.queryByText("Add column")).not.toBeInTheDocument();
  });

  it("falls back to the read-only TableDetail when no structure capability is granted", () => {
    render(
      <TableStructure
        {...makeProps({ canEditColumns: false, canManageIndexes: false, canEditTable: false })}
      />
    );
    expect(screen.getByTestId("table-detail")).toBeInTheDocument();
  });

  it("shows column, index, and table-lifecycle controls when fully writable", () => {
    render(<TableStructure {...makeProps()} />);
    expect(screen.getByText("Add column")).toBeInTheDocument();
    expect(screen.getByText("Create index")).toBeInTheDocument();
    expect(screen.getByText("Truncate table")).toBeInTheDocument();
    expect(screen.getByText("Drop table")).toBeInTheDocument();
    expect(screen.getByLabelText("Edit column email")).toBeInTheDocument();
    expect(screen.getByLabelText("Drop column email")).toBeInTheDocument();
  });

  it("hides column controls for MongoDB even when canEditColumns is true", () => {
    render(
      <TableStructure
        {...makeProps({ engine: "mongodb", table: makeTable({ kind: "collection" }) })}
      />
    );
    expect(screen.queryByText("Add column")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Edit column email")).not.toBeInTheDocument();
    // Index and table-lifecycle controls remain, since those gates are independent.
    expect(screen.getByText("Create index")).toBeInTheDocument();
    expect(screen.getByText("Drop table")).toBeInTheDocument();
  });

  it("never shows a drop button for the primary index", () => {
    render(<TableStructure {...makeProps()} />);
    expect(screen.queryByLabelText("Drop index orders_pkey")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Drop index orders_email_idx")).toBeInTheDocument();
  });

  it("adds a column and closes the dialog on success", async () => {
    const onAddColumn = vi.fn().mockResolvedValue(undefined);
    render(<TableStructure {...makeProps({ onAddColumn })} />);
    fireEvent.click(screen.getByText("Add column"));
    const dialog = screen.getByTestId("add-column-dialog");
    fireEvent.change(within(dialog).getByLabelText("Column name"), { target: { value: "total" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add column" }));

    await waitFor(() =>
      expect(onAddColumn).toHaveBeenCalledWith({
        name: "total",
        dataType: "text",
        nullable: true,
        default: null
      })
    );
    await waitFor(() => expect(screen.queryByTestId("add-column-dialog")).not.toBeInTheDocument());
  });

  it("keeps the add-column dialog open and shows the error on failure", async () => {
    const onAddColumn = vi
      .fn()
      .mockRejectedValue(new Error("A column named total already exists."));
    render(<TableStructure {...makeProps({ onAddColumn })} />);
    fireEvent.click(screen.getByText("Add column"));
    const dialog = screen.getByTestId("add-column-dialog");
    fireEvent.change(within(dialog).getByLabelText("Column name"), { target: { value: "total" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add column" }));

    expect(await screen.findByText("A column named total already exists.")).toBeInTheDocument();
    expect(screen.getByTestId("add-column-dialog")).toBeInTheDocument();
  });

  it("edits a column via the Edit dialog", async () => {
    const onEditColumn = vi.fn().mockResolvedValue(undefined);
    render(<TableStructure {...makeProps({ onEditColumn })} />);
    fireEvent.click(screen.getByLabelText("Edit column email"));
    fireEvent.click(screen.getByLabelText("Not null"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onEditColumn).toHaveBeenCalledWith("email", { changes: { nullable: false } })
    );
  });

  it("drops a column via typed confirmation", async () => {
    const onDropColumn = vi.fn().mockResolvedValue(undefined);
    render(<TableStructure {...makeProps({ onDropColumn })} />);
    fireEvent.click(screen.getByLabelText("Drop column email"));
    const dropButton = screen.getByRole("button", { name: "Drop column" });
    expect(dropButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("email"), { target: { value: "email" } });
    fireEvent.click(dropButton);

    await waitFor(() => expect(onDropColumn).toHaveBeenCalledWith("email"));
  });

  it("creates an index via the Create index dialog", async () => {
    const onCreateIndex = vi.fn().mockResolvedValue(undefined);
    render(<TableStructure {...makeProps({ onCreateIndex })} />);
    fireEvent.click(screen.getByText("Create index"));
    const dialog = screen.getByTestId("create-index-dialog");
    fireEvent.change(within(dialog).getByLabelText("Index name"), {
      target: { value: "orders_id_idx" }
    });
    fireEvent.click(within(dialog).getByText("id"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Create index" }));

    await waitFor(() =>
      expect(onCreateIndex).toHaveBeenCalledWith({
        name: "orders_id_idx",
        columns: ["id"],
        unique: false
      })
    );
  });

  it("drops an index immediately with no confirmation dialog", async () => {
    const onDropIndex = vi.fn().mockResolvedValue(undefined);
    render(<TableStructure {...makeProps({ onDropIndex })} />);
    fireEvent.click(screen.getByLabelText("Drop index orders_email_idx"));

    await waitFor(() => expect(onDropIndex).toHaveBeenCalledWith("orders_email_idx"));
    expect(screen.queryByTestId("confirm-typed-name-dialog")).not.toBeInTheDocument();
  });

  it("renames the table inline", async () => {
    const onRenameTable = vi.fn().mockResolvedValue(undefined);
    render(<TableStructure {...makeProps({ onRenameTable })} />);
    fireEvent.click(screen.getByLabelText("Rename table"));
    fireEvent.change(screen.getByLabelText("New table name"), { target: { value: "purchases" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onRenameTable).toHaveBeenCalledWith("purchases"));
  });

  it("truncates the table via typed confirmation", async () => {
    const onTruncateTable = vi.fn().mockResolvedValue(undefined);
    render(<TableStructure {...makeProps({ onTruncateTable })} />);
    fireEvent.click(screen.getByText("Truncate table"));
    const dialog = screen.getByTestId("confirm-typed-name-dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("orders"), {
      target: { value: "orders" }
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Truncate table" }));

    await waitFor(() => expect(onTruncateTable).toHaveBeenCalledOnce());
  });

  it("drops the table via typed confirmation", async () => {
    const onDropTable = vi.fn().mockResolvedValue(undefined);
    render(<TableStructure {...makeProps({ onDropTable })} />);
    fireEvent.click(screen.getByText("Drop table"));
    const dialog = screen.getByTestId("confirm-typed-name-dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("orders"), {
      target: { value: "orders" }
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Drop table" }));

    await waitFor(() => expect(onDropTable).toHaveBeenCalledOnce());
  });
});
