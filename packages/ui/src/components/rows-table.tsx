import type { RowPage } from "@humb/core";
import type { CSSProperties, ReactNode } from "react";
import { formatCell } from "../format-cell.js";

export interface RowsTableProps {
  rowPage: RowPage;
  page: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

const cellStyle: CSSProperties = {
  textAlign: "left",
  padding: "0.375rem 0.5rem",
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap"
};

/** A page of table rows with previous/next pagination controls. */
export function RowsTable({
  rowPage,
  page,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext
}: RowsTableProps): ReactNode {
  if (rowPage.rows.length === 0) {
    return (
      <div data-testid="rows-table">
        <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>No rows in this table.</p>
      </div>
    );
  }

  return (
    <div data-testid="rows-table">
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr>
              {rowPage.columns.map((column) => (
                <th key={column} style={cellStyle}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowPage.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {rowPage.columns.map((column) => (
                  <td key={column} style={cellStyle}>
                    {formatCell(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "0.75rem"
        }}
      >
        <span style={{ fontSize: "0.8125rem", color: "#6b7280" }}>Page {page + 1}</span>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" disabled={!canGoPrevious} onClick={onPrevious}>
            Previous
          </button>
          <button type="button" disabled={!canGoNext} onClick={onNext}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
