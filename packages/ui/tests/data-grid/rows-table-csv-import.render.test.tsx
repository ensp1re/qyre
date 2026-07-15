import type { RowPage } from "@qyre/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RowsTable } from "../../src/data-grid/table/rows-table.js";

const rowPage: RowPage = { columns: ["name"], rows: [{ name: "Ada" }], page: 0, pageSize: 25 };

describe("RowsTable CSV import affordance (F117)", () => {
  it("renders and calls the import action only when explicitly permitted", () => {
    const onImportCsv = vi.fn();
    const { rerender } = render(
      <RowsTable
        rowPage={rowPage}
        page={0}
        canGoPrevious={false}
        canGoNext={false}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        canImportCsv
        onImportCsv={onImportCsv}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));
    expect(onImportCsv).toHaveBeenCalledOnce();

    rerender(
      <RowsTable
        rowPage={rowPage}
        page={0}
        canGoPrevious={false}
        canGoNext={false}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        canImportCsv={false}
        onImportCsv={onImportCsv}
      />
    );
    expect(screen.queryByRole("button", { name: "Import CSV" })).not.toBeInTheDocument();
  });
});
