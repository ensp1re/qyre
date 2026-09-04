import type { ColumnMetadata, DatabaseEngine, FilterOp, RowFilter } from "@qyre/core";
import type { FilterCapability } from "@qyre/core/filter-capabilities";
import { filterCapabilityForColumn } from "@qyre/core/filter-capabilities";
import { ListFilter, Search, X } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../cn.js";
import { Select } from "../../primitives/controls/select.js";
import { DateTimeInput, type DateTimeInputKind } from "../../primitives/date-time-input.js";
import { friendlyTypeLabel } from "../../primitives/format-cell.js";
import { TypeIcon } from "../../primitives/type-icon.js";
import { useFocusTrap } from "../../primitives/use-focus-trap.js";
import { StructuredTextEditor, structuredTextError } from "../editing/structured-text-editor.js";

export interface FilterBarProps {
  columns: ColumnMetadata[];
  engine?: DatabaseEngine;
  filters: RowFilter[] | undefined;
  onFiltersChange: (filters: RowFilter[] | undefined) => void;
}
import { EMPTY_DRAFT, HintFooter, NO_VALUE_OPS, OP_META, type Draft } from "./filter-editor.js";

function columnsMatching(columns: readonly ColumnMetadata[], queryValue: string): ColumnMetadata[] {
  const query = queryValue.trim().toLowerCase();
  if (!query) return [...columns];
  return columns.filter((column) => column.name.toLowerCase().includes(query));
}

export function FilterBar({
  columns,
  engine,
  filters,
  onFiltersChange
}: FilterBarProps): ReactNode {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const highlightedRef = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const opListRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open);

  const active = filters ?? [];
  const step: "column" | "op" | "value" = !draft.column ? "column" : !draft.op ? "op" : "value";

  const filterableColumns = useMemo(
    () =>
      columns.filter((column) => filterCapabilityForColumn(column, engine).operators.length > 0),
    [columns, engine]
  );

  const matchingColumns = useMemo(
    () => columnsMatching(filterableColumns, query),
    [filterableColumns, query]
  );

  const draftCapability: FilterCapability | undefined = draft.column
    ? filterCapabilityForColumn(draft.column, engine)
    : undefined;
  const operatorOrder = draftCapability?.operators ?? [];
  const isBooleanColumn = draftCapability?.valueInput === "boolean";
  const isEnumColumn = Boolean(
    draft.column?.allowedValues?.length && (draft.op === "eq" || draft.op === "neq")
  );
  const valueInputKind = draftCapability?.valueInput ?? "text";
  const isStructuredJson = valueInputKind === "json";
  const structuredValueError = isStructuredJson ? structuredTextError(draft.value) : undefined;
  const isDateValueInput =
    valueInputKind === "date" || valueInputKind === "time" || valueInputKind === "datetime-local";

  function updateHighlighted(next: number): void {
    highlightedRef.current = next;
    setHighlighted(next);
  }

  useEffect(() => {
    if (step !== "column") return;
    document.getElementById(`filter-column-option-${highlighted}`)?.scrollIntoView?.({
      block: "nearest"
    });
  }, [highlighted, step]);

  useEffect(() => {
    if (step === "op") opListRef.current?.querySelector("button")?.focus();
  }, [step]);

  function close(): void {
    setOpen(false);
    setDraft(EMPTY_DRAFT);
    setEditIndex(null);
    setQuery("");
    updateHighlighted(0);
  }

  function apply(filter: RowFilter): void {
    const next = [...active];
    if (editIndex !== null) next[editIndex] = filter;
    else next.push(filter);
    onFiltersChange(next);
    close();
  }

  function pickColumn(column: ColumnMetadata): void {
    const capability = filterCapabilityForColumn(column, engine);
    if (capability.operators.length === 0) return;
    setDraft((current) => ({ ...current, column }));
    setQuery("");
    updateHighlighted(0);
  }

  function pickOperator(op: FilterOp): void {
    if (NO_VALUE_OPS.has(op)) {
      apply({ column: (draft.column as ColumnMetadata).name, op });
      return;
    }
    setDraft((current) => ({ ...current, op }));
  }

  function applyValue(explicitValue?: string): void {
    const value = explicitValue ?? draft.value;
    if (!draft.column || !draft.op || value === "") return;
    if (draftCapability?.valueInput === "json" && structuredTextError(value)) return;
    apply({ column: draft.column.name, op: draft.op, value });
  }

  function stepBack(): void {
    if (step === "value") setDraft((current) => ({ ...current, op: undefined }));
    else if (step === "op") setDraft((current) => ({ ...current, column: undefined }));
    else close();
  }

  function editFilter(index: number): void {
    const filter = active[index];
    if (!filter) return;
    const column = columns.find((c) => c.name === filter.column) ?? {
      name: filter.column,
      dataType: "unknown",
      nullable: true,
      isPrimaryKey: false,
      isForeignKey: false
    };
    setDraft({
      column,
      op: NO_VALUE_OPS.has(filter.op) ? undefined : filter.op,
      value: filter.value ?? ""
    });
    setEditIndex(index);
    setOpen(true);
  }

  function removeFilter(index: number): void {
    const next = active.filter((_, i) => i !== index);
    onFiltersChange(next.length > 0 ? next : undefined);
  }

  function onColumnSearchKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    const liveMatchingColumns = columnsMatching(filterableColumns, event.currentTarget.value);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      updateHighlighted(
        Math.min(highlightedRef.current + 1, Math.max(liveMatchingColumns.length - 1, 0))
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      updateHighlighted(Math.max(highlightedRef.current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const column =
        liveMatchingColumns[
          Math.min(highlightedRef.current, Math.max(liveMatchingColumns.length - 1, 0))
        ];
      if (column) pickColumn(column);
    }
  }

  function onOperatorListKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const options = Array.from(opListRef.current?.querySelectorAll("button") ?? []);
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "ArrowDown" ? index + 1 : index - 1;
    options[Math.max(0, Math.min(next, options.length - 1))]?.focus();
  }

  function onPanelKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.stopPropagation();
      stepBack();
    }
  }

  return (
    <div className="relative flex flex-wrap items-center gap-1.5">
      {active.map((filter, index) => (
        <span key={`${filter.column}-${filter.op}-${index}`} className="flex items-center gap-1.5">
          {index > 0 && <span className="text-[9px] text-quiet-foreground">and</span>}
          <span className="flex items-stretch overflow-hidden rounded-[3px] border border-border bg-accent/50 font-mono text-[11px]">
            <button
              type="button"
              onClick={() => editFilter(index)}
              title="Edit filter"
              className="flex items-center gap-1.5 px-2 py-1 hover:bg-accent"
            >
              <TypeIcon
                dataType={columns.find((c) => c.name === filter.column)?.dataType ?? "unknown"}
              />
              <span className="text-foreground/90">{filter.column}</span>
              <span className="text-muted-foreground">{OP_META[filter.op].symbol}</span>
              {filter.value !== undefined && (
                <span className="max-w-32 truncate text-primary" title={filter.value}>
                  {filter.value}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => removeFilter(index)}
              aria-label={`Remove filter on ${filter.column}`}
              className="flex items-center border-l border-border px-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        </span>
      ))}

      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        disabled={filterableColumns.length === 0}
        aria-label="Add filter"
        aria-expanded={open}
        title="Filter the whole table server-side"
        className={cn(
          "flex h-6 items-center gap-0 rounded-[3px] border border-border px-1.5 font-mono text-[11px] transition-colors disabled:opacity-30 lg:gap-1.5 lg:px-2",
          active.length > 0
            ? "text-primary hover:bg-accent"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
      >
        <ListFilter className="h-3 w-3" />
        {active.length === 0 ? (
          <span className="hidden lg:inline">Filter rows</span>
        ) : (
          active.length
        )}
      </button>

      {active.length >= 2 && (
        <button
          type="button"
          onClick={() => onFiltersChange(undefined)}
          aria-label="Clear all filters"
          className="rounded-[3px] px-1.5 py-1 font-mono text-[10px] text-quiet-foreground hover:bg-accent hover:text-destructive"
        >
          Clear
        </button>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} aria-hidden="true" />
          <div
            ref={panelRef}
            role="dialog"
            aria-label={editIndex !== null ? "Edit filter" : "Add filter"}
            onKeyDown={onPanelKeyDown}
            className="absolute left-0 top-full z-50 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-[4px] border border-border bg-popover font-mono text-[11px] shadow-lg"
          >
            {(draft.column || draft.op) && (
              <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
                {draft.column && (
                  <button
                    type="button"
                    onClick={() => setDraft((current) => ({ ...current, column: undefined }))}
                    title="Change column"
                    className="flex items-center gap-1 rounded-[2px] bg-accent px-1.5 py-0.5 text-foreground/90 hover:text-foreground"
                  >
                    <TypeIcon dataType={draft.column.dataType} />
                    {draft.column.name}
                  </button>
                )}
                {draft.op && (
                  <button
                    type="button"
                    onClick={() => setDraft((current) => ({ ...current, op: undefined }))}
                    title="Change operator"
                    className="rounded-[2px] bg-accent px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
                  >
                    {OP_META[draft.op].word}
                  </button>
                )}
              </div>
            )}

            {step === "column" && (
              <>
                <div
                  data-focus-surface
                  className="flex items-center gap-1.5 border-b border-border px-2 py-1.5 text-muted-foreground transition-colors focus-within:bg-accent/60 focus-within:shadow-[inset_2px_0_0_rgb(var(--primary))]"
                >
                  <Search className="h-2.5 w-2.5 shrink-0" />
                  <input
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      updateHighlighted(0);
                    }}
                    onKeyDown={onColumnSearchKeyDown}
                    autoFocus
                    placeholder="Search columns..."
                    aria-label="Search columns"
                    role="combobox"
                    aria-expanded="true"
                    aria-controls="filter-column-listbox"
                    aria-activedescendant={
                      matchingColumns[highlighted]
                        ? `filter-column-option-${highlighted}`
                        : undefined
                    }
                    className="w-full bg-transparent text-foreground outline-none placeholder:text-quiet-foreground"
                  />
                </div>
                <div
                  id="filter-column-listbox"
                  role="listbox"
                  aria-label="Columns"
                  className="max-h-56 overflow-y-auto p-1"
                >
                  {matchingColumns.length === 0 ? (
                    <p className="px-2 py-2 text-quiet-foreground">
                      {filterableColumns.length === 0
                        ? "No filterable columns"
                        : "No matching columns"}
                    </p>
                  ) : (
                    matchingColumns.map((column, index) => (
                      <button
                        key={column.name}
                        id={`filter-column-option-${index}`}
                        type="button"
                        role="option"
                        aria-selected={index === highlighted}
                        onClick={() => pickColumn(column)}
                        onMouseEnter={() => updateHighlighted(index)}
                        className={cn(
                          "flex w-full items-center gap-1.5 rounded-[2px] px-2 py-1.5 text-left",
                          index === highlighted ? "bg-accent text-foreground" : "text-foreground/80"
                        )}
                      >
                        <TypeIcon dataType={column.dataType} />
                        <span className="truncate">{column.name}</span>
                        {column.isPrimaryKey && (
                          <span
                            className="text-[9px] font-bold"
                            style={{ color: "var(--c-amber)" }}
                          >
                            PK
                          </span>
                        )}
                        {column.isForeignKey && (
                          <span className="text-[9px] font-bold" style={{ color: "var(--c-blue)" }}>
                            FK
                          </span>
                        )}
                        <span className="ml-auto shrink-0 text-[9px] text-quiet-foreground">
                          {friendlyTypeLabel(column.dataType)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
                <HintFooter text="↑↓ navigate · ↵ select · esc close" />
              </>
            )}

            {step === "op" && (
              <>
                <div
                  ref={opListRef}
                  role="listbox"
                  aria-label="Operators"
                  onKeyDown={onOperatorListKeyDown}
                  className="p-1"
                >
                  {operatorOrder.map((op) => (
                    <button
                      key={op}
                      type="button"
                      role="option"
                      aria-selected={editIndex !== null && active[editIndex]?.op === op}
                      onClick={() => pickOperator(op)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-[2px] px-2 py-1.5 text-left text-foreground/80 hover:bg-accent hover:text-foreground focus:bg-accent focus:text-foreground focus:outline-none",
                        editIndex !== null && active[editIndex]?.op === op && "text-primary"
                      )}
                    >
                      {OP_META[op].word}
                      {OP_META[op].symbol !== OP_META[op].word && (
                        <span className="text-quiet-foreground">{OP_META[op].symbol}</span>
                      )}
                    </button>
                  ))}
                </div>
                <HintFooter text="↑↓ navigate · ↵ select · esc back" />
              </>
            )}

            {step === "value" && isBooleanColumn && (
              <>
                <div className="flex items-center gap-1.5 p-2">
                  <button
                    type="button"
                    autoFocus
                    onClick={() => applyValue("true")}
                    className="flex-1 rounded-[3px] border border-border px-2 py-1.5 text-foreground/80 hover:bg-accent hover:text-foreground"
                  >
                    true
                  </button>
                  <button
                    type="button"
                    onClick={() => applyValue("false")}
                    className="flex-1 rounded-[3px] border border-border px-2 py-1.5 text-foreground/80 hover:bg-accent hover:text-foreground"
                  >
                    false
                  </button>
                </div>
                <HintFooter text="select a value · esc back" />
              </>
            )}

            {step === "value" && isEnumColumn && (
              <>
                <div className="grid gap-1.5 p-2">
                  <Select
                    label="Filter value"
                    value={draft.value || undefined}
                    options={(draft.column?.allowedValues ?? []).map((value) => ({
                      value,
                      label: value
                    }))}
                    onValueChange={(value) => setDraft((current) => ({ ...current, value }))}
                  />
                  <button
                    type="button"
                    onClick={() => applyValue()}
                    disabled={draft.value === ""}
                    className="rounded-[3px] bg-primary px-2 py-1.5 text-primary-foreground disabled:opacity-40"
                  >
                    Apply
                  </button>
                </div>
                <HintFooter text="choose a value · ↵ apply · esc back" />
              </>
            )}

            {step === "value" && isStructuredJson && (
              <>
                <div className="grid gap-1.5 p-2">
                  <StructuredTextEditor
                    text={draft.value}
                    onChange={(value) => setDraft((current) => ({ ...current, value }))}
                    label="Filter JSON value"
                    minHeightClassName="min-h-24 max-h-40"
                    variant="minimal"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => applyValue()}
                    disabled={draft.value === "" || Boolean(structuredValueError)}
                    className="rounded-[3px] bg-primary px-2 py-1.5 text-primary-foreground disabled:opacity-40"
                  >
                    Apply
                  </button>
                </div>
                <HintFooter text="enter JSON · click Apply · esc back" />
              </>
            )}

            {step === "value" && !isBooleanColumn && !isEnumColumn && !isStructuredJson && (
              <>
                <div
                  className={cn("flex gap-1.5 p-2", isDateValueInput ? "flex-col" : "items-center")}
                >
                  {isDateValueInput ? (
                    <DateTimeInput
                      kind={valueInputKind as DateTimeInputKind}
                      value={draft.value}
                      onChange={(value) => setDraft((current) => ({ ...current, value }))}
                      onEnter={() => applyValue()}
                      autoFocus
                    />
                  ) : (
                    <input
                      type={valueInputKind}
                      value={draft.value}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, value: event.target.value }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") applyValue(event.currentTarget.value);
                      }}
                      placeholder={
                        draftCapability?.kind === "objectId" ? "ObjectId hex..." : "Value..."
                      }
                      aria-label="Filter value"
                      autoFocus
                      inputMode={valueInputKind === "number" ? "decimal" : undefined}
                      className="w-full rounded-[3px] border border-border bg-secondary px-2 py-1.5 text-foreground outline-none placeholder:text-quiet-foreground focus:border-primary"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => applyValue()}
                    disabled={draft.value === ""}
                    className={cn(
                      "rounded-[3px] bg-primary px-2 py-1.5 text-primary-foreground disabled:opacity-40",
                      isDateValueInput ? "w-full" : "shrink-0"
                    )}
                  >
                    Apply
                  </button>
                </div>
                <HintFooter text="↵ apply · esc back" />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
