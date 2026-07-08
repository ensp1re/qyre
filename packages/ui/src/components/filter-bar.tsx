import type { ColumnMetadata, FilterOp, RowFilter } from "@qyre/core";
import { ListFilter, Search, X } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../cn.js";
import { useFocusTrap } from "../use-focus-trap.js";
import { classifyColumnKind, TypeIcon } from "./type-icon.js";

export interface FilterBarProps {
  /** The table's real columns - drives the popover's column picker and each chip's type icon. */
  columns: ColumnMetadata[];
  /** The filters currently applied server-side (F072), or undefined when none. */
  filters: RowFilter[] | undefined;
  /** Reports the full next filter set; undefined means "no filters" (matching RowsTable's
   * `onFiltersChange` contract - the caller re-fetches accordingly). */
  onFiltersChange: (filters: RowFilter[] | undefined) => void;
}

/** Word + symbol per operator - the popover menu shows the word (readable for newcomers) with the
 * symbol as a muted hint; chips show the symbol (compact, familiar to SQL users). Not imported
 * from @qyre/core's FILTER_OPS - its barrel has Node-only imports that break Vite's browser build
 * the moment a real (non-type) value is imported (see use-rows.ts's UI_PAGE_SIZE comment). */
const OP_META: Record<FilterOp, { word: string; symbol: string }> = {
  eq: { word: "equals", symbol: "=" },
  neq: { word: "not equals", symbol: "≠" },
  contains: { word: "contains", symbol: "contains" },
  lt: { word: "less than", symbol: "<" },
  lte: { word: "less or equal", symbol: "≤" },
  gt: { word: "greater than", symbol: ">" },
  gte: { word: "greater or equal", symbol: "≥" },
  isNull: { word: "is null", symbol: "is null" },
  isNotNull: { word: "is not null", symbol: "is not null" }
};

const NO_VALUE_OPS = new Set<FilterOp>(["isNull", "isNotNull"]);

/** Operator menu order per column kind - the likeliest operator for that type comes first
 * (contains for text, comparisons for numeric/date), so the common case is one Enter away. */
const OP_ORDER_BY_KIND: Record<ReturnType<typeof classifyColumnKind>, FilterOp[]> = {
  text: ["contains", "eq", "neq", "gt", "gte", "lt", "lte", "isNull", "isNotNull"],
  numeric: ["eq", "neq", "gt", "gte", "lt", "lte", "contains", "isNull", "isNotNull"],
  datetime: ["eq", "neq", "gt", "gte", "lt", "lte", "contains", "isNull", "isNotNull"],
  boolean: ["eq", "neq", "isNull", "isNotNull", "contains", "gt", "gte", "lt", "lte"],
  other: ["eq", "neq", "contains", "gt", "gte", "lt", "lte", "isNull", "isNotNull"]
};

/** In-progress filter being composed or edited. Which popover step renders is derived from what's
 * filled in (no column -> pick column; no op -> pick operator; both -> type the value), so "go
 * back" is just clearing a field and there's no separate step state to keep in sync. */
interface Draft {
  column?: ColumnMetadata;
  op?: FilterOp;
  value: string;
}

const EMPTY_DRAFT: Draft = { value: "" };

/** One muted keyboard-hint line at the popover's foot. */
function HintFooter({ text }: { text: string }): ReactNode {
  return (
    <div className="border-t border-border px-2 py-1 text-[9px] tracking-wide text-muted-foreground/50">
      {text}
    </div>
  );
}

/**
 * The Tables toolbar's server-side filter control (F072): a Filter button opening an anchored
 * popover with a progressive three-step flow (searchable column list -> operator list -> value),
 * plus the applied filters as segmented chips - click a chip to edit it in the same popover,
 * click its x to remove it, "Clear" to drop them all. Filters always combine with AND (the spec
 * scopes OR out), stated by the small "and" separators between chips.
 *
 * Keyboard: arrows + Enter drive both lists (the column list keeps focus in its search input via
 * aria-activedescendant; the operator list uses roving focus), Enter applies the value, and
 * Escape walks one step back until it closes. Focus is trapped while open and restored to the
 * trigger on close (useFocusTrap).
 */
export function FilterBar({ columns, filters, onFiltersChange }: FilterBarProps): ReactNode {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  /** Index into `filters` being edited, or null when composing a new one. */
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const opListRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open);

  const active = filters ?? [];
  const step: "column" | "op" | "value" = !draft.column ? "column" : !draft.op ? "op" : "value";

  const matchingColumns = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return columns;
    return columns.filter((column) => column.name.toLowerCase().includes(q));
  }, [columns, query]);

  const operatorOrder = draft.column
    ? OP_ORDER_BY_KIND[classifyColumnKind(draft.column.dataType)]
    : OP_ORDER_BY_KIND.other;

  useEffect(() => setHighlighted(0), [query]);

  // Keep the highlighted column option visible while arrowing through a long list.
  useEffect(() => {
    if (step !== "column") return;
    // Optional-chain the method itself - jsdom (test env) has no scrollIntoView implementation.
    document.getElementById(`filter-column-option-${highlighted}`)?.scrollIntoView?.({
      block: "nearest"
    });
  }, [highlighted, step]);

  // The operator list uses roving focus (it has no search input to hold focus the way the column
  // step does) - focus its first option when the step is reached.
  useEffect(() => {
    if (step === "op") opListRef.current?.querySelector("button")?.focus();
  }, [step]);

  function close(): void {
    setOpen(false);
    setDraft(EMPTY_DRAFT);
    setEditIndex(null);
    setQuery("");
    setHighlighted(0);
  }

  function apply(filter: RowFilter): void {
    const next = [...active];
    if (editIndex !== null) next[editIndex] = filter;
    else next.push(filter);
    onFiltersChange(next);
    close();
  }

  function pickColumn(column: ColumnMetadata): void {
    setDraft((current) => ({ ...current, column }));
    setQuery("");
  }

  function pickOperator(op: FilterOp): void {
    if (NO_VALUE_OPS.has(op)) {
      // Null checks need no value - applying immediately keeps the common flow at two picks.
      apply({ column: (draft.column as ColumnMetadata).name, op });
      return;
    }
    setDraft((current) => ({ ...current, op }));
  }

  function applyValue(): void {
    if (!draft.column || !draft.op || draft.value === "") return;
    apply({ column: draft.column.name, op: draft.op, value: draft.value });
  }

  /** Escape walks one step back; from the first step it closes. */
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
    // A null-check filter has no value step - reopen at the operator step so there's something to
    // change; a value filter reopens at the value step with the current value ready to retype.
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
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((current) => Math.min(current + 1, matchingColumns.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const column = matchingColumns[highlighted];
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
          {index > 0 && <span className="text-[9px] text-muted-foreground/50">and</span>}
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
        disabled={columns.length === 0}
        aria-label="Add filter"
        aria-expanded={open}
        title="Filter the whole table server-side"
        className={cn(
          "flex items-center gap-1.5 rounded-[3px] border border-border px-2 py-1 font-mono text-[11px] transition-colors disabled:opacity-30",
          active.length > 0
            ? "text-primary hover:bg-accent"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
      >
        <ListFilter className="h-3 w-3" />
        {active.length === 0 && "Filter"}
      </button>

      {active.length >= 2 && (
        <button
          type="button"
          onClick={() => onFiltersChange(undefined)}
          aria-label="Clear all filters"
          className="rounded-[3px] px-1.5 py-1 font-mono text-[10px] text-muted-foreground/70 hover:bg-accent hover:text-destructive"
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
            className="absolute left-0 top-full z-50 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-[4px] border border-border bg-popover font-mono text-[11px] shadow-lg"
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
                <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5 text-muted-foreground">
                  <Search className="h-2.5 w-2.5 shrink-0" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={onColumnSearchKeyDown}
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
                    className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground/60"
                  />
                </div>
                <div
                  id="filter-column-listbox"
                  role="listbox"
                  aria-label="Columns"
                  className="max-h-56 overflow-y-auto p-1"
                >
                  {matchingColumns.length === 0 ? (
                    <p className="px-2 py-2 text-muted-foreground/60">No matching columns</p>
                  ) : (
                    matchingColumns.map((column, index) => (
                      <button
                        key={column.name}
                        id={`filter-column-option-${index}`}
                        type="button"
                        role="option"
                        aria-selected={index === highlighted}
                        onClick={() => pickColumn(column)}
                        onMouseEnter={() => setHighlighted(index)}
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
                        <span className="ml-auto shrink-0 text-[9px] text-muted-foreground/60">
                          {column.dataType}
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
                        <span className="text-muted-foreground/60">{OP_META[op].symbol}</span>
                      )}
                    </button>
                  ))}
                </div>
                <HintFooter text="↑↓ navigate · ↵ select · esc back" />
              </>
            )}

            {step === "value" && (
              <>
                <div className="flex items-center gap-1.5 p-2">
                  <input
                    value={draft.value}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, value: event.target.value }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") applyValue();
                    }}
                    placeholder="Value..."
                    aria-label="Filter value"
                    autoFocus
                    className="w-full rounded-[3px] border border-border bg-secondary px-2 py-1.5 text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={applyValue}
                    disabled={draft.value === ""}
                    className="shrink-0 rounded-[3px] bg-primary px-2 py-1.5 text-primary-foreground disabled:opacity-40"
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
