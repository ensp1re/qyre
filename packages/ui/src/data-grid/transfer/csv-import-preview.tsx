import type { CsvImportPreviewRow, CsvImportResult } from "@qyre/core";
import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

function displayValue(value: unknown): string {
  if (value === null) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function CsvImportPreviewTable({
  rows,
  columns
}: {
  rows: CsvImportPreviewRow[];
  columns: string[];
}): ReactNode {
  if (rows.length === 0) {
    return <p className="font-mono text-[10px] text-muted-foreground">No preview rows.</p>;
  }
  return (
    <div className="max-h-40 overflow-auto rounded-[3px] border border-border">
      <table className="min-w-full border-collapse font-mono text-[10px]">
        <thead className="sticky top-0 bg-secondary">
          <tr>
            <th className="border-b border-r border-border px-2 py-1 text-right text-muted-foreground">
              line
            </th>
            {columns.map((column) => (
              <th
                key={column}
                className="whitespace-nowrap border-b border-r border-border px-2 py-1 text-left font-medium"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.line} className="border-b border-border/60">
              <td className="border-r border-border px-2 py-1 text-right text-muted-foreground">
                {row.line}
              </td>
              {columns.map((column) => (
                <td key={column} className="whitespace-nowrap border-r border-border px-2 py-1">
                  {displayValue(row.values[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CsvImportReport({
  report,
  imported
}: {
  report: CsvImportResult;
  imported: boolean;
}): ReactNode {
  return (
    <section className="flex flex-col gap-2 rounded-[3px] border border-border bg-secondary/40 p-3">
      <div className="flex flex-wrap items-center gap-3 font-mono text-[10px]">
        <span>{report.rowCount} total</span>
        <span style={{ color: "var(--c-green)" }}>{report.validRows} valid</span>
        {imported && <span style={{ color: "var(--c-blue)" }}>{report.insertedRows} inserted</span>}
        <span style={report.failedRows ? { color: "var(--c-red)" } : undefined}>
          {report.failedRows} failed
        </span>
      </div>
      {report.errors.length > 0 ? (
        <div className="max-h-32 overflow-auto rounded-[2px] border border-border bg-card p-2">
          {report.errors.length < report.failedRows && (
            <p className="mb-1.5 font-mono text-[10px]" style={{ color: "var(--c-amber)" }}>
              Showing the first {report.errors.length} of {report.failedRows} errors.
            </p>
          )}
          {report.errors.map((item) => (
            <p
              key={`${item.line}-${item.column ?? "row"}`}
              className="font-mono text-[10px]"
              style={{ color: "var(--c-red)" }}
            >
              Line {item.line}
              {item.column ? ` · ${item.column}` : ""}: {item.message}
            </p>
          ))}
        </div>
      ) : (
        <p
          className="flex items-center gap-1.5 font-mono text-[10px]"
          style={{ color: "var(--c-green)" }}
        >
          <CheckCircle2 className="h-3 w-3" /> No row errors found.
        </p>
      )}
    </section>
  );
}
