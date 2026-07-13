import type {
  ColumnMetadata,
  CsvImportInspection,
  CsvImportMapping,
  CsvImportResult
} from "@qyre/core";
import { CSV_IMPORT_MAX_FILE_BYTES } from "@qyre/core/csv-import";
import { AlertTriangle, FileUp, X } from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "../feedback/spinner.js";
import { useFocusTrap } from "../primitives/use-focus-trap.js";
import { CsvImportPreviewTable, CsvImportReport } from "./csv-import-preview.js";

export interface CsvImportDialogProps {
  tableName: string;
  columns: ColumnMetadata[];
  onInspect: (file: File) => Promise<CsvImportInspection>;
  onValidate: (file: File, mapping: CsvImportMapping) => Promise<CsvImportResult>;
  onImport: (file: File, mapping: CsvImportMapping) => Promise<CsvImportResult>;
  onImported: () => void;
  onClose: () => void;
}

type BusyStage = "inspect" | "validate" | "import" | undefined;

export function CsvImportDialog({
  tableName,
  columns,
  onInspect,
  onValidate,
  onImport,
  onImported,
  onClose
}: CsvImportDialogProps): ReactNode {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);
  const [file, setFile] = useState<File | undefined>(undefined);
  const [inspection, setInspection] = useState<CsvImportInspection | undefined>(undefined);
  const [mapping, setMapping] = useState<CsvImportMapping>({});
  const [validation, setValidation] = useState<CsvImportResult | undefined>(undefined);
  const [result, setResult] = useState<CsvImportResult | undefined>(undefined);
  const [busy, setBusy] = useState<BusyStage>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [busy, onClose]);

  const mappedTargets = useMemo(
    () => new Set(Object.values(mapping).filter((target): target is string => target !== null)),
    [mapping]
  );
  const mappedCount = mappedTargets.size;
  const activeReport = result ?? validation;
  const previewColumns = activeReport
    ? [...new Set(Object.values(mapping).filter((target): target is string => target !== null))]
    : (inspection?.headers ?? []);

  async function handleFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const nextFile = event.target.files?.[0];
    setFile(nextFile);
    setInspection(undefined);
    setMapping({});
    setValidation(undefined);
    setResult(undefined);
    setError(undefined);
    if (!nextFile) return;
    if (!nextFile.name.toLowerCase().endsWith(".csv")) {
      setError("Choose a file with a .csv extension.");
      return;
    }
    if (nextFile.size > CSV_IMPORT_MAX_FILE_BYTES) {
      setError("CSV files may be at most 10 MiB.");
      return;
    }

    setBusy("inspect");
    try {
      const inspected = await onInspect(nextFile);
      setInspection(inspected);
      const targetNames = new Set(columns.map((column) => column.name));
      setMapping(
        Object.fromEntries(
          inspected.headers.map((header) => [header, targetNames.has(header) ? header : null])
        )
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to inspect CSV.");
    } finally {
      setBusy(undefined);
    }
  }

  function changeMapping(source: string, target: string): void {
    setMapping((current) => ({ ...current, [source]: target === "" ? null : target }));
    setValidation(undefined);
    setResult(undefined);
    setError(undefined);
  }

  async function validate(): Promise<void> {
    if (!file || mappedCount === 0) return;
    setBusy("validate");
    setValidation(undefined);
    setResult(undefined);
    setError(undefined);
    try {
      setValidation(await onValidate(file, mapping));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "CSV dry run failed.");
    } finally {
      setBusy(undefined);
    }
  }

  async function runImport(): Promise<void> {
    if (!file || !validation || validation.validRows === 0) return;
    setBusy("import");
    setResult(undefined);
    setError(undefined);
    try {
      const imported = await onImport(file, mapping);
      setResult(imported);
      onImported();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "CSV import failed.");
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" aria-hidden="true" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="csv-import-title"
        data-testid="csv-import-dialog"
        className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-[48rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[3px] border border-border bg-card outline-none"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <FileUp className="h-3.5 w-3.5" style={{ color: "var(--c-blue)" }} />
          <div>
            <h2 id="csv-import-title" className="font-mono text-[12px] font-medium">
              Import CSV into {tableName}
            </h2>
            <p className="font-mono text-[10px] text-muted-foreground">
              Up to 10 MiB, 10,000 rows, and 256 columns.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(busy)}
            aria-label="Close CSV import"
            className="ml-auto rounded-[2px] p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              1. Choose file
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void handleFile(event)}
              disabled={Boolean(busy)}
              className="rounded-[3px] border border-border bg-secondary px-2 py-1 font-mono text-[11px] file:mr-2 file:rounded-[2px] file:border-0 file:bg-accent file:px-2 file:py-0.5 file:text-[10px] file:text-foreground"
            />
          </label>

          {busy === "inspect" && (
            <p className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
              <Spinner /> Inspecting the complete file...
            </p>
          )}

          {inspection && (
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  2. Map columns
                </h3>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {inspection.rowCount.toLocaleString()} row(s)
                </span>
              </div>
              <div className="grid max-h-36 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-x-2 gap-y-1 overflow-auto rounded-[3px] border border-border p-2 font-mono text-[10px]">
                {inspection.headers.map((header) => (
                  <div key={header} className="contents">
                    <span className="truncate py-1" title={header}>
                      {header}
                    </span>
                    <span className="py-1 text-muted-foreground">→</span>
                    <select
                      aria-label={`Map ${header}`}
                      value={mapping[header] ?? ""}
                      onChange={(event) => changeMapping(header, event.target.value)}
                      disabled={Boolean(busy)}
                      className="min-w-0 rounded-[2px] border border-border bg-secondary px-1 py-0.5 outline-none focus:border-foreground/40"
                    >
                      <option value="">Ignore</option>
                      {columns.map((column) => (
                        <option
                          key={column.name}
                          value={column.name}
                          disabled={
                            mappedTargets.has(column.name) && mapping[header] !== column.name
                          }
                        >
                          {column.name} ({column.dataType})
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <h3 className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                {activeReport ? "Server-coerced preview" : "Raw preview"}
              </h3>
              <CsvImportPreviewTable
                rows={activeReport?.preview ?? inspection.preview}
                columns={previewColumns}
              />
            </section>
          )}

          {activeReport && <CsvImportReport report={activeReport} imported={Boolean(result)} />}

          {error && (
            <p
              className="flex items-start gap-1.5 font-mono text-[10px]"
              style={{ color: "var(--c-red)" }}
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(busy)}
            className="rounded-[3px] px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            {result ? "Close" : "Cancel"}
          </button>
          {!result && (
            <>
              <button
                type="button"
                onClick={() => void validate()}
                disabled={!inspection || mappedCount === 0 || Boolean(busy)}
                className="flex items-center gap-1.5 rounded-[3px] border border-border px-3 py-1 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === "validate" && <Spinner className="h-2.5 w-2.5" />}
                Dry run
              </button>
              <button
                type="button"
                onClick={() => void runImport()}
                disabled={!validation || validation.validRows === 0 || Boolean(busy)}
                className="flex items-center gap-1.5 rounded-[3px] bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === "import" && <Spinner className="h-2.5 w-2.5" />}
                Import{validation ? ` ${validation.validRows} valid row(s)` : ""}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
