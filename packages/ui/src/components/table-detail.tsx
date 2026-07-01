import type { TableMetadata } from "@humb/core";
import type { CSSProperties, ReactNode } from "react";

export interface TableDetailProps {
  table: TableMetadata;
}

const cellStyle: CSSProperties = {
  textAlign: "left",
  padding: "0.375rem 0.5rem",
  borderBottom: "1px solid #e5e7eb"
};

/** Columns, primary key, indexes, and approximate row count for a single table. */
export function TableDetail({ table }: TableDetailProps): ReactNode {
  return (
    <div data-testid="table-detail">
      {table.rowCount !== undefined && (
        <p style={{ margin: "0 0 0.75rem", color: "#6b7280", fontSize: "0.875rem" }}>
          ~{table.rowCount} row{table.rowCount === 1 ? "" : "s"}
        </p>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
        <thead>
          <tr>
            <th style={cellStyle}>Column</th>
            <th style={cellStyle}>Type</th>
            <th style={cellStyle}>Nullable</th>
            <th style={cellStyle}>Key</th>
          </tr>
        </thead>
        <tbody>
          {table.columns.map((column) => (
            <tr key={column.name}>
              <td style={cellStyle}>{column.name}</td>
              <td style={cellStyle}>{column.dataType}</td>
              <td style={cellStyle}>{column.nullable ? "yes" : "no"}</td>
              <td style={cellStyle}>{column.isPrimaryKey ? "PK" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {table.indexes && table.indexes.length > 0 && (
        <ul
          style={{
            marginTop: "0.75rem",
            paddingLeft: "1.25rem",
            fontSize: "0.8125rem",
            color: "#6b7280"
          }}
        >
          {table.indexes.map((index) => (
            <li key={index.name}>
              {index.name} ({index.columns.join(", ")})
              {index.primary ? " · primary key" : index.unique ? " · unique" : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
