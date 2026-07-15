import type { CsvImportResult } from "@qyre/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CsvImportReport } from "../../src/data-grid/transfer/csv-import-preview.js";

describe("CsvImportReport truncated errors (F136)", () => {
  it("shows a 'showing first N of M' notice when the error list was capped", () => {
    const report: CsvImportResult = {
      mode: "validate",
      rowCount: 150,
      validRows: 0,
      insertedRows: 0,
      failedRows: 150,
      preview: [],
      errors: Array.from({ length: 100 }, (_, index) => ({
        line: index + 2,
        message: "bad row"
      }))
    };
    render(<CsvImportReport report={report} imported={false} />);
    expect(screen.getByText("Showing the first 100 of 150 errors.")).toBeInTheDocument();
  });

  it("shows no truncation notice when every failed row's error is present", () => {
    const report: CsvImportResult = {
      mode: "validate",
      rowCount: 2,
      validRows: 1,
      insertedRows: 0,
      failedRows: 1,
      preview: [],
      errors: [{ line: 3, column: "age", message: "bad" }]
    };
    render(<CsvImportReport report={report} imported={false} />);
    expect(screen.queryByText(/Showing the first/)).not.toBeInTheDocument();
  });

  it("shows no truncation notice, and a success message, when there are no errors", () => {
    const report: CsvImportResult = {
      mode: "validate",
      rowCount: 2,
      validRows: 2,
      insertedRows: 0,
      failedRows: 0,
      preview: [],
      errors: []
    };
    render(<CsvImportReport report={report} imported={false} />);
    expect(screen.queryByText(/Showing the first/)).not.toBeInTheDocument();
    expect(screen.getByText("No row errors found.")).toBeInTheDocument();
  });
});
