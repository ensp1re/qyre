import type { RowPage } from "@humb/core";
import type { CSSProperties, ReactNode } from "react";
import { formatCell } from "../format-cell.js";

export interface QueryRunnerProps {
  sql: string;
  onSqlChange: (sql: string) => void;
  onRun: () => void;
  isRunning: boolean;
  result?: RowPage;
  error?: string;
}

const cellStyle: CSSProperties = {
  textAlign: "left",
  padding: "0.375rem 0.5rem",
  borderBottom: "1px solid #e5e7eb"
};

/** A read-only SQL query box: SELECT-style statements only, enforced server-side. */
export function QueryRunner({
  sql,
  onSqlChange,
  onRun,
  isRunning,
  result,
  error
}: QueryRunnerProps): ReactNode {
  return (
    <div data-testid="query-runner">
      <textarea
        value={sql}
        onChange={(event) => onSqlChange(event.target.value)}
        placeholder="SELECT * FROM my_table LIMIT 10"
        rows={4}
        style={{
          width: "100%",
          fontFamily: "monospace",
          fontSize: "0.875rem",
          padding: "0.5rem",
          boxSizing: "border-box"
        }}
      />
      <div style={{ marginTop: "0.5rem" }}>
        <button type="button" onClick={onRun} disabled={isRunning || sql.trim().length === 0}>
          {isRunning ? "Running..." : "Run query"}
        </button>
      </div>

      {error && (
        <p data-testid="query-error" style={{ color: "#dc2626", marginTop: "0.75rem" }}>
          {error}
        </p>
      )}

      {result && !error && (
        <div data-testid="query-result" style={{ marginTop: "0.75rem", overflowX: "auto" }}>
          {result.rows.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>Query returned no rows.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr>
                  {result.columns.map((column) => (
                    <th key={column} style={cellStyle}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {result.columns.map((column) => (
                      <td key={column} style={cellStyle}>
                        {formatCell(row[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
