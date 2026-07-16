import type { ColumnMetadata, RowExportFormat, RowPage } from "@qyre/core";
import { mutationEditorCapability } from "@qyre/core/mutation-editor-capabilities";
import { mutationValueText } from "@qyre/core/mutation-editor-values";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { PointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatCell } from "../../primitives/format-cell.js";
import type { InspectableValue } from "../cells/cell-value.js";
import { computeRowKey, DEFAULT_EXPORT_FORMATS, ROW_HEIGHT_ESTIMATE, toCsv } from "./row-export.js";
import type { RowsTableProps } from "./rows-table-types.js";

interface RowsTableModelInput {
  rowPage: RowPage;
  columns: ColumnMetadata[];
  engine: RowsTableProps["engine"];
  sortColumn: string | undefined;
  sortDirection: "asc" | "desc" | undefined;
  onSortChange: RowsTableProps["onSortChange"];
  onFiltersChange: RowsTableProps["onFiltersChange"];
  exportFormats: readonly RowExportFormat[];
  onExportAllRows: RowsTableProps["onExportAllRows"];
  onExportSelectedRows: RowsTableProps["onExportSelectedRows"];
  primaryKeyColumns: RowsTableProps["primaryKeyColumns"];
  pendingChanges: RowsTableProps["pendingChanges"];
  canInsert: RowsTableProps["canInsert"];
  insertableColumns: RowsTableProps["insertableColumns"];
  canDelete: RowsTableProps["canDelete"];
}

export function useRowsTableModel({
  rowPage,
  columns,
  engine,
  sortColumn,
  sortDirection,
  onSortChange,
  onFiltersChange,
  exportFormats = DEFAULT_EXPORT_FORMATS,
  onExportAllRows,
  onExportSelectedRows,
  primaryKeyColumns,
  pendingChanges,
  canInsert,
  insertableColumns,
  canDelete
}: RowsTableModelInput) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectedExportFormat, setSelectedExportFormat] = useState<RowExportFormat>("csv");
  const [inspected, setInspected] = useState<{
    column: string;
    value: InspectableValue;
  } | null>(null);
  const [dateInspected, setDateInspected] = useState<{
    value: unknown;
    anchorRect: DOMRect;
  } | null>(null);
  // The one cell editor allowed open across the whole grid at a time (F146) - a stable per-cell id
  // (see cellEditorId below), not the cell's own local state, so activating one editor closes any
  // other and the table never shows the stacked-popover clutter of independent per-cell state.
  const [activeEditor, setActiveEditor] = useState<string | null>(null);
  // The grid's single selected cell (F146) - separate from `activeEditor`: a click selects without
  // editing, and arrow/Tab keys move this instead of DOM focus alone so selection survives
  // virtualized rows scrolling in and out of the DOM.
  const [selectedCell, setSelectedCell] = useState<{
    rowIndex: number;
    column: string;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragSelectionMode = useRef<"select" | "deselect" | null>(null);

  const columnByName = useMemo(
    () => new Map(columns.map((column) => [column.name, column])),
    [columns]
  );

  const indexed = useMemo(() => rowPage.rows.map((row, index) => ({ row, index })), [rowPage.rows]);

  // Rows arrive already sorted server-side (F065) when a sort is active - this only narrows by the
  // free-text filter below, it never reorders.
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return indexed;
    return indexed.filter(({ row }) =>
      Object.values(row).some((value) => formatCell(value).toLowerCase().includes(query))
    );
  }, [indexed, search]);

  const visibleIndexes = useMemo(() => filtered.map(({ index }) => index), [filtered]);
  const selectedVisibleCount = visibleIndexes.filter((index) => selected.has(index)).length;
  const allVisibleSelected =
    visibleIndexes.length > 0 && selectedVisibleCount === visibleIndexes.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  useEffect(() => {
    setSelected(new Set());
  }, [rowPage.rows, search]);

  useEffect(() => {
    const stopDrag = () => {
      dragSelectionMode.current = null;
    };
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    return () => {
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
  }, []);

  // F051: only the visible rows (plus overscan) mount as DOM nodes, instead of every row in the
  // current page - a wide table at the SQL Editor's 1000-row cap (F050) would otherwise mount
  // thousands of cells.
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: 8
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const topPadding = virtualRows[0]?.start ?? 0;
  const bottomPadding =
    rowVirtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1]?.end ?? 0);

  function handleSort(column: string): void {
    if (!onSortChange) return;
    if (sortColumn !== column) {
      onSortChange({ column, direction: "asc" });
    } else if (sortDirection === "asc") {
      onSortChange({ column, direction: "desc" });
    } else {
      onSortChange(undefined);
    }
  }

  /** Clicking a primary-key cell's value drills into just that row (F072) - replaces the active
   * filter set rather than adding to it, since appending to whatever filters happened to already
   * be active would be surprising. */
  function filterToPrimaryKeyValue(column: string, value: unknown): void {
    onFiltersChange?.([{ column, op: "eq", value: formatCell(value) }]);
  }

  function toggleRow(index: number): void {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function setRowSelected(index: number, shouldSelect: boolean): void {
    setSelected((current) => {
      if (current.has(index) === shouldSelect) return current;
      const next = new Set(current);
      if (shouldSelect) next.add(index);
      else next.delete(index);
      return next;
    });
  }

  function toggleVisibleRows(): void {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const index of visibleIndexes) next.delete(index);
      } else {
        for (const index of visibleIndexes) next.add(index);
      }
      return next;
    });
  }

  function isInteractiveTarget(target: EventTarget | null): boolean {
    return target instanceof Element
      ? Boolean(target.closest("button,input,a,select,textarea,label"))
      : false;
  }

  function startRowSelectionDrag(index: number, event: PointerEvent<HTMLTableRowElement>) {
    if (event.button !== 0 || isInteractiveTarget(event.target)) return;
    const shouldSelect = !selected.has(index);
    dragSelectionMode.current = shouldSelect ? "select" : "deselect";
    setRowSelected(index, shouldSelect);
    event.preventDefault();
  }

  function applyRowSelectionDrag(index: number): void {
    if (!dragSelectionMode.current) return;
    setRowSelected(index, dragSelectionMode.current === "select");
  }

  async function copySelected(): Promise<void> {
    const rows = filtered.filter(({ index }) => selected.has(index)).map(({ row }) => row);
    await navigator.clipboard.writeText(toCsv(rowPage.columns, rows));
  }

  const canExportSelectedRows = selected.size > 0 && Boolean(onExportSelectedRows);
  const defaultExportFormat = exportFormats.includes("csv") ? "csv" : exportFormats[0];
  const activeExportFormat = exportFormats.includes(selectedExportFormat)
    ? selectedExportFormat
    : defaultExportFormat;

  function exportRows(): void {
    if (!canExportSelectedRows) {
      if (activeExportFormat) onExportAllRows?.(activeExportFormat);
      return;
    }
    const rows = filtered.filter(({ index }) => selected.has(index)).map(({ row }) => row);
    onExportSelectedRows?.(toCsv(rowPage.columns, rows));
  }

  // F104: Add-row/Duplicate-row are hidden entirely (not disabled) when the session/table can't
  // insert - see docs/product-specs/row-editing.md.
  const canAddRow = Boolean(canInsert && pendingChanges);

  /** Pre-fills a new draft from an existing row's insertable columns, primary key excluded - a
   * duplicate never proposes an exact copy of another row's key, which would just collide on
   * insert; the user (or the engine, if auto-generated) supplies a new one. */
  function duplicateRow(row: Record<string, unknown>): void {
    if (!pendingChanges || !insertableColumns) return;
    const initialValues: Record<string, unknown> = {};
    for (const columnName of insertableColumns) {
      if (primaryKeyColumns?.includes(columnName)) continue;
      const value = row[columnName];
      if (value === null || value === undefined) continue;
      const column = columnByName.get(columnName);
      const capability = column
        ? mutationEditorCapability(column.dataType, engine, column)
        : undefined;
      initialValues[columnName] =
        capability?.widget === "binary" ? mutationValueText(value, capability) : value;
    }
    pendingChanges.addInsert(initialValues);
  }

  // F105: staging is hidden entirely (not disabled) when the session/table can't delete, mirroring
  // canAddRow above.
  const canStageDelete = Boolean(canDelete && pendingChanges && primaryKeyColumns);

  /** Stages every currently-selected row for deletion - clicking this button IS the explicit
   * confirming click docs/product-specs/row-editing.md requires for delete, distinct from mere
   * selection (which stays a read-only, side-effect-free action everywhere else in this table). */
  function stageSelectedForDelete(): void {
    if (!pendingChanges || !primaryKeyColumns) return;
    for (const { row, index } of filtered) {
      if (!selected.has(index)) continue;
      pendingChanges.stageDelete(computeRowKey(row, primaryKeyColumns));
    }
    setSelected(new Set());
  }
  return {
    search,
    setSearch,
    selected,
    setSelected,
    selectedExportFormat,
    setSelectedExportFormat,
    inspected,
    setInspected,
    dateInspected,
    setDateInspected,
    activeEditor,
    setActiveEditor,
    selectedCell,
    setSelectedCell,
    rowVirtualizer,
    scrollRef,
    columnByName,
    filtered,
    visibleIndexes,
    allVisibleSelected,
    someVisibleSelected,
    virtualRows,
    topPadding,
    bottomPadding,
    handleSort,
    filterToPrimaryKeyValue,
    toggleRow,
    toggleVisibleRows,
    startRowSelectionDrag,
    applyRowSelectionDrag,
    copySelected,
    canExportSelectedRows,
    activeExportFormat,
    exportRows,
    canAddRow,
    duplicateRow,
    canStageDelete,
    stageSelectedForDelete
  };
}
