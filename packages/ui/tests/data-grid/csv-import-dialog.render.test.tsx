import type { CsvImportInspection, CsvImportResult } from "@qyre/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CsvImportDialog } from "../../src/data-grid/transfer/csv-import-dialog.js";

const inspection: CsvImportInspection = {
  mode: "inspect",
  headers: ["name", "Age"],
  rowCount: 2,
  preview: [
    { line: 2, values: { name: "Ada", Age: "42" } },
    { line: 3, values: { name: "Grace", Age: "bad" } }
  ]
};

const validation: CsvImportResult = {
  mode: "validate",
  rowCount: 2,
  validRows: 1,
  insertedRows: 0,
  failedRows: 1,
  preview: [{ line: 2, values: { name: "Ada", age: 42 } }],
  errors: [{ line: 3, column: "age", message: "Column expects a finite number." }]
};

const columns = [
  { name: "name", dataType: "varchar", nullable: false, isPrimaryKey: false, isForeignKey: false },
  { name: "age", dataType: "int4", nullable: false, isPrimaryKey: false, isForeignKey: false }
];

describe("CsvImportDialog (component rendering, F117)", () => {
  it("inspects, maps, dry-runs, and imports only after the dry run", async () => {
    const onInspect = vi.fn().mockResolvedValue(inspection);
    const onValidate = vi.fn().mockResolvedValue(validation);
    const onImport = vi.fn().mockResolvedValue({
      ...validation,
      mode: "import",
      insertedRows: 1
    });
    const onImported = vi.fn();
    render(
      <CsvImportDialog
        tableName="users"
        columns={columns}
        onInspect={onInspect}
        onValidate={onValidate}
        onImport={onImport}
        onImported={onImported}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    const file = new File(["name,Age\nAda,42\nGrace,bad\n"], "users.csv", {
      type: "text/csv"
    });
    fireEvent.change(screen.getByLabelText("1. Choose file"), { target: { files: [file] } });

    await waitFor(() => expect(onInspect).toHaveBeenCalledWith(file));
    expect(screen.getByLabelText("Map name")).toHaveValue("name");
    fireEvent.change(screen.getByLabelText("Map Age"), { target: { value: "age" } });
    fireEvent.click(screen.getByRole("button", { name: "Dry run" }));

    await waitFor(() =>
      expect(onValidate).toHaveBeenCalledWith(file, { name: "name", Age: "age" })
    );
    expect(screen.getByText(/Line 3 · age/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Import 1 valid row(s)" }));

    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    expect(onImported).toHaveBeenCalledOnce();
    expect(screen.getByText("1 inserted")).toBeInTheDocument();
  });

  it("rejects an oversized file before calling the server", async () => {
    const onInspect = vi.fn();
    render(
      <CsvImportDialog
        tableName="users"
        columns={columns}
        onInspect={onInspect}
        onValidate={vi.fn()}
        onImport={vi.fn()}
        onImported={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const file = new File(["x"], "users.csv", { type: "text/csv" });
    Object.defineProperty(file, "size", { value: 11 * 1024 * 1024 });
    fireEvent.change(screen.getByLabelText("1. Choose file"), { target: { files: [file] } });

    expect(await screen.findByText("CSV files may be at most 10 MiB.")).toBeInTheDocument();
    expect(onInspect).not.toHaveBeenCalled();
  });

  it("locks file and mapping inputs while a server dry run is in flight", async () => {
    render(
      <CsvImportDialog
        tableName="users"
        columns={columns}
        onInspect={vi.fn().mockResolvedValue(inspection)}
        onValidate={vi.fn().mockReturnValue(new Promise(() => {}))}
        onImport={vi.fn()}
        onImported={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const file = new File(["name,Age\nAda,42\n"], "users.csv", { type: "text/csv" });
    const fileInput = screen.getByLabelText("1. Choose file");
    fireEvent.change(fileInput, { target: { files: [file] } });
    await screen.findByLabelText("Map name");
    fireEvent.click(screen.getByRole("button", { name: "Dry run" }));

    expect(fileInput).toBeDisabled();
    expect(screen.getByLabelText("Map name")).toBeDisabled();
  });
});
