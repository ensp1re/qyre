import { mutationEditorCapability } from "@qyre/core/mutation-editor-capabilities";
import { parseMutationDraft } from "@qyre/core/mutation-editor-values";
import { ArrowUpDown, CopyPlus, Pencil, Trash2 } from "lucide-react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode
} from "react";
import { cn } from "../../cn.js";
import { formatCell, friendlyTypeLabel } from "../../primitives/format-cell.js";
import { TypeIcon } from "../../primitives/type-icon.js";
import { CellValueDrawer } from "../cells/cell-value-drawer.js";
import { CellValue, truncateForDisplay } from "../cells/cell-value.js";
import { DateDetailPopover } from "../cells/date-detail-popover.js";
import { EditableCell } from "../cells/editable-cell.js";
import { NewRowCell } from "../cells/new-row-cell.js";
import type { CommitDirection } from "../editing/inline-cell-editor.js";
import { computeRowKey, DEFAULT_EXPORT_FORMATS, toCsv } from "./row-export.js";
import type { RowsTableProps } from "./rows-table-types.js";
import { RowsTableFooter } from "./rows-table-footer.js";
import { RowsTableToolbar } from "./rows-table-toolbar.js";
import { useRowsTableModel } from "./use-rows-table.js";

export { toCsv };
export type { RowsTableProps };

/** Fixed per-column pixel width (F146/A01) - paired with `table-layout: fixed` so a long value
 * truncates with an ellipsis instead of expanding the column/row indefinitely. The full value
 * stays reachable via CellValueDrawer/DateDetailPopover, never silently hidden. */
const COLUMN_WIDTH = 220;

export function RowsTable({
  rowPage,
  columns = [],
  engine,
  tableName,
  approxRowCount,
  page,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
  onRefresh,
  onNavigateToForeignKey,
  sortColumn,
  sortDirection,
  onSortChange,
  exportFormats = DEFAULT_EXPORT_FORMATS,
  jsonExportMode = "json",
  onExportAllRows,
  onExportSelectedRows,
  canImportCsv,
  onImportCsv,
  filters,
  onFiltersChange,
  editable,
  editableColumns,
  editingDisabledReason,
  primaryKeyColumns,
  pendingChanges,
  canInsert,
  insertableColumns,
  canDelete,
  canEditDocument,
  onEditDocument,
  canInsertDocument,
  onInsertDocument
}: RowsTableProps): ReactNode {
  const {
    search,
    setSearch,
    selected,
    setSelected,
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
  } = useRowsTableModel({
    rowPage,
    columns,
    engine,
    sortColumn,
    sortDirection,
    onSortChange,
    onFiltersChange,
    exportFormats,
    onExportAllRows,
    onExportSelectedRows,
    primaryKeyColumns,
    pendingChanges,
    canInsert,
    insertableColumns,
    canDelete
  });

  // Columns Tab/Shift+Tab may land on - editable, non-PK, and (when FK navigation is available)
  // non-FK, mirroring `isEditableCell`'s column-level conditions below without the per-row ones.
  const editableColumnOrder = rowPage.columns.filter((name) => {
    const meta = columnByName.get(name);
    if (!editableColumns?.has(name) || meta?.isPrimaryKey) return false;
    if (meta?.isForeignKey && onNavigateToForeignKey) return false;
    return true;
  });

  function focusCell(cellId: string): void {
    requestAnimationFrame(() => {
      const target = scrollRef.current?.querySelector<HTMLElement>(
        `[data-cell-id="${CSS.escape(cellId)}"]`
      );
      target?.focus();
    });
  }

  /** Moves the grid's selection after Enter/Tab/Shift+Tab commits an inline edit (F146) -
   * spreadsheet-style "commit and advance" so editing several cells/rows in sequence never dead-
   * ends back at a plain display cell with no next step. */
  function moveSelection(rowIndex: number, column: string, direction: CommitDirection): void {
    let nextRowIndex = rowIndex;
    let nextColumn = column;

    if (direction === "enter") {
      nextRowIndex = Math.min(rowIndex + 1, filtered.length - 1);
    } else {
      const at = editableColumnOrder.indexOf(column);
      const delta = direction === "tab" ? 1 : -1;
      const next = at + delta;
      if (next >= 0 && next < editableColumnOrder.length) {
        nextColumn = editableColumnOrder[next] ?? column;
      } else {
        nextRowIndex = Math.min(Math.max(rowIndex + delta, 0), filtered.length - 1);
        nextColumn =
          (delta > 0
            ? editableColumnOrder[0]
            : editableColumnOrder[editableColumnOrder.length - 1]) ?? column;
      }
    }

    setSelectedCell({ rowIndex: nextRowIndex, column: nextColumn });
    rowVirtualizer.scrollToIndex(nextRowIndex);
    const nextItem = filtered[nextRowIndex];
    const nextRowKey =
      nextItem && pendingChanges && primaryKeyColumns
        ? computeRowKey(nextItem.row, primaryKeyColumns)
        : undefined;
    if (nextRowKey) focusCell(`${nextRowKey}:${nextColumn}`);
  }

  /** The click event starts after focus/blur processing, so an inline input can stage its draft
   * first. Then any different table cell dismisses the old scalar, structured, or insert editor. */
  function dismissEditorFromOtherCell(event: ReactMouseEvent<HTMLDivElement>): void {
    if (!activeEditor || !(event.target instanceof Element)) return;
    const clickedCell = event.target.closest<HTMLTableCellElement>("td");
    if (clickedCell && clickedCell.dataset.editorId !== activeEditor) setActiveEditor(null);
  }

  /** Arrow-key/copy/paste/revert grid shortcuts (F146), scoped to the current `selectedCell` -
   * attached to the scroll container so it fires regardless of which cell's control has DOM focus. */
  function handleGridKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (!selectedCell || activeEditor) return;
    const item = filtered[selectedCell.rowIndex];
    if (!item) return;
    const rowKey =
      pendingChanges && primaryKeyColumns ? computeRowKey(item.row, primaryKeyColumns) : undefined;
    const meta = columnByName.get(selectedCell.column);
    const staged =
      rowKey && pendingChanges ? pendingChanges.getEdit(rowKey, selectedCell.column) : undefined;
    const currentValue = staged ? staged.next : item.row[selectedCell.column];
    const isEditableSelected =
      rowKey !== undefined && editableColumnOrder.includes(selectedCell.column);

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const nextRowIndex = Math.min(
        Math.max(selectedCell.rowIndex + delta, 0),
        filtered.length - 1
      );
      setSelectedCell({ rowIndex: nextRowIndex, column: selectedCell.column });
      rowVirtualizer.scrollToIndex(nextRowIndex);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const at = rowPage.columns.indexOf(selectedCell.column);
      const nextAt = Math.min(Math.max(at + delta, 0), rowPage.columns.length - 1);
      const nextColumn = rowPage.columns[nextAt];
      if (nextColumn) setSelectedCell({ rowIndex: selectedCell.rowIndex, column: nextColumn });
    } else if (event.key === "Escape") {
      setSelectedCell(null);
    } else if (
      (event.key === "Delete" || event.key === "Backspace") &&
      isEditableSelected &&
      rowKey &&
      pendingChanges &&
      meta?.nullable
    ) {
      event.preventDefault();
      pendingChanges.stageEdit(rowKey, selectedCell.column, item.row[selectedCell.column], null);
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      if (isEditableSelected && rowKey && pendingChanges && staged) {
        event.preventDefault();
        pendingChanges.revertEdit(rowKey, selectedCell.column);
      }
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
      event.preventDefault();
      void navigator.clipboard.writeText(formatCell(currentValue));
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
      if (!isEditableSelected || !rowKey || !pendingChanges) return;
      event.preventDefault();
      void navigator.clipboard.readText().then((text) => {
        const rows = text
          .split(/\r\n|\r|\n/)
          .filter((_, i, arr) => !(i === arr.length - 1 && arr[i] === ""));
        rows.forEach((line, rowOffset) => {
          const targetItem = filtered[selectedCell.rowIndex + rowOffset];
          if (!targetItem) return;
          const targetRowKey =
            primaryKeyColumns && pendingChanges
              ? computeRowKey(targetItem.row, primaryKeyColumns)
              : undefined;
          if (!targetRowKey) return;
          const cells = line.split("\t");
          const startAt = editableColumnOrder.indexOf(selectedCell.column);
          cells.forEach((cellText, colOffset) => {
            const targetColumn = editableColumnOrder[startAt + colOffset];
            const targetMeta = targetColumn ? columnByName.get(targetColumn) : undefined;
            if (!targetColumn || !targetMeta) return;
            const targetMetadata = {
              allowedValues: targetMeta.allowedValues,
              elementDataType: targetMeta.elementDataType
            };
            const capability = mutationEditorCapability(
              targetMeta.dataType,
              engine,
              targetMetadata
            );
            if (!capability.editable) return;
            // Skip (never stage) a pasted value that fails type validation - safer than silently
            // corrupting a cell with an unparseable value the user didn't mean to paste there.
            const result = parseMutationDraft(cellText, capability, engine, targetMetadata);
            if (!result.valid) return;
            pendingChanges.stageEdit(
              targetRowKey,
              targetColumn,
              targetItem.row[targetColumn],
              result.value
            );
          });
        });
      });
    }
  }

  return (
    <div className="flex h-full flex-col">
      <RowsTableToolbar
        search={search}
        onSearchChange={setSearch}
        columns={columns}
        engine={engine}
        filters={filters}
        onFiltersChange={onFiltersChange}
        editable={editable}
        editingDisabledReason={editingDisabledReason}
        canAddRow={canAddRow}
        onAddRow={pendingChanges ? () => pendingChanges.addInsert() : undefined}
        canInsertDocument={canInsertDocument}
        onInsertDocument={onInsertDocument}
        canImportCsv={canImportCsv}
        onImportCsv={onImportCsv}
        selected={selected}
        setSelected={setSelected}
        onCopySelected={copySelected}
        canStageDelete={canStageDelete}
        onStageSelectedForDelete={stageSelectedForDelete}
        canExportSelectedRows={canExportSelectedRows}
        exportFormats={exportFormats}
        activeExportFormat={activeExportFormat}
        onExportFormatChange={setSelectedExportFormat}
        jsonExportMode={jsonExportMode}
        onExportAllRows={onExportAllRows}
        onExportRows={exportRows}
        onRefresh={onRefresh}
      />
      {rowPage.rows.length === 0 && !(pendingChanges && pendingChanges.inserts.length > 0) ? (
        <div data-testid="rows-table" className="flex-1 p-3">
          <p className="font-mono text-[11px] text-muted-foreground">No rows in this table.</p>
        </div>
      ) : (
        <div
          data-testid="rows-table"
          ref={scrollRef}
          className="flex-1 overflow-auto"
          onClickCapture={dismissEditorFromOtherCell}
          onKeyDown={handleGridKeyDown}
        >
          <table className="border-collapse font-mono text-[11px]" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 32 }} />
              <col style={{ width: canAddRow ? 56 : 32 }} />
              {rowPage.columns.map((columnName) => (
                <col key={columnName} style={{ width: COLUMN_WIDTH }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-card">
              <tr>
                <th className="border-b border-r border-border px-2 py-2 text-center">
                  <label className="inline-flex cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      disabled={visibleIndexes.length === 0}
                      onChange={toggleVisibleRows}
                      ref={(input) => {
                        if (input) input.indeterminate = someVisibleSelected;
                      }}
                      aria-label="Select all rows on this page"
                      aria-checked={
                        someVisibleSelected ? "mixed" : allVisibleSelected ? "true" : "false"
                      }
                      className="h-3 w-3 accent-primary"
                    />
                  </label>
                </th>
                <th className="border-b border-r border-border px-2 py-2 text-right font-normal text-quiet-foreground">
                  #
                </th>
                {rowPage.columns.map((columnName) => {
                  const meta = columnByName.get(columnName);
                  return (
                    <th
                      key={columnName}
                      onClick={onSortChange ? () => handleSort(columnName) : undefined}
                      title={columnName}
                      className={cn(
                        "group border-b border-r border-border px-3 py-1.5 text-left font-medium text-muted-foreground",
                        onSortChange ? "cursor-pointer hover:text-foreground" : undefined
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{columnName}</span>
                        {onSortChange && (
                          <ArrowUpDown
                            className={cn(
                              "h-2.5 w-2.5 shrink-0 transition-opacity",
                              sortColumn === columnName
                                ? "text-primary opacity-100"
                                : "opacity-0 group-hover:opacity-40"
                            )}
                          />
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 font-mono text-[9px] font-normal text-quiet-foreground">
                        {meta && <TypeIcon dataType={meta.dataType} />}
                        <span className="truncate">
                          {meta ? friendlyTypeLabel(meta.dataType) : "unknown"}
                        </span>
                        {meta?.isPrimaryKey && (
                          <span className="shrink-0 font-bold" style={{ color: "var(--c-amber)" }}>
                            PK
                          </span>
                        )}
                        {meta?.isForeignKey && (
                          <span className="shrink-0 font-bold" style={{ color: "var(--c-blue)" }}>
                            FK
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {canAddRow &&
                pendingChanges &&
                pendingChanges.inserts.map((insert) => (
                  <tr
                    key={insert.id}
                    className="border-b border-border-subtle"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--c-green) 8%, transparent)"
                    }}
                  >
                    <td className="w-8 border-r border-border-subtle px-2 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => pendingChanges.removeInsert(insert.id)}
                        aria-label="Discard new row"
                        title="Discard new row"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                    <td
                      className="w-14 border-r border-border-subtle px-2 py-1.5 text-right font-bold"
                      style={{ color: "var(--c-green)" }}
                    >
                      new
                    </td>
                    {rowPage.columns.map((columnName) => {
                      const meta = columnByName.get(columnName);
                      const isInsertable = insertableColumns?.has(columnName);
                      const insertEditorId = `insert:${insert.id}:${columnName}`;
                      return (
                        <td
                          key={columnName}
                          data-editor-id={isInsertable ? insertEditorId : undefined}
                          className="relative overflow-hidden border-r border-border-subtle px-3 py-1.5"
                        >
                          {isInsertable ? (
                            <NewRowCell
                              value={insert.values[columnName]}
                              columnName={columnName}
                              dataType={meta?.dataType ?? "unknown"}
                              allowedValues={meta?.allowedValues}
                              elementDataType={meta?.elementDataType}
                              engine={engine}
                              nullable={meta?.nullable ?? true}
                              onChange={(next) =>
                                pendingChanges.updateInsertValue(insert.id, columnName, next)
                              }
                              isActive={activeEditor === insertEditorId}
                              onActivate={() => setActiveEditor(insertEditorId)}
                              onDeactivate={() =>
                                setActiveEditor((current) =>
                                  current === insertEditorId ? null : current
                                )
                              }
                            />
                          ) : (
                            <span
                              className="italic text-quiet-foreground"
                              title={
                                meta
                                  ? mutationEditorCapability(meta.dataType, engine, meta)
                                      .unavailableReason
                                  : undefined
                              }
                            >
                              not editable
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              {topPadding > 0 && (
                <tr>
                  <td colSpan={rowPage.columns.length + 2} style={{ height: topPadding }} />
                </tr>
              )}
              {virtualRows.map((virtualRow) => {
                const item = filtered[virtualRow.index];
                if (!item) return null;
                const { row, index } = item;
                const rowKey =
                  pendingChanges && primaryKeyColumns
                    ? computeRowKey(row, primaryKeyColumns)
                    : undefined;
                const markedForDelete = Boolean(rowKey && pendingChanges?.deletes.has(rowKey));
                return (
                  <tr
                    key={index}
                    data-index={virtualRow.index}
                    onPointerDown={(event) => startRowSelectionDrag(index, event)}
                    onPointerEnter={() => applyRowSelectionDrag(index)}
                    className={cn(
                      "cursor-pointer select-none border-b border-border-subtle hover:bg-accent/40",
                      selected.has(index) && "bg-primary/5"
                    )}
                    style={
                      markedForDelete
                        ? { backgroundColor: "color-mix(in srgb, var(--c-red) 8%, transparent)" }
                        : undefined
                    }
                  >
                    <td className="w-8 border-r border-border-subtle px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={selected.has(index)}
                        onChange={() => toggleRow(index)}
                        onClick={(event) => event.stopPropagation()}
                        disabled={markedForDelete}
                        className="h-3 w-3 accent-primary"
                        aria-label={`Select row ${virtualRow.index + 1}`}
                      />
                    </td>
                    <td
                      className={cn(
                        "border-r border-border-subtle px-1 py-1.5 text-right text-quiet-foreground",
                        canAddRow || markedForDelete || canEditDocument ? "w-14" : "w-8"
                      )}
                    >
                      <div className="flex items-center justify-end gap-1">
                        {markedForDelete ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (rowKey) pendingChanges?.unstageDelete(rowKey);
                            }}
                            aria-label={`Undo delete row ${virtualRow.index + 1}`}
                            title="Undo delete"
                            className="font-mono text-[9px] font-bold hover:underline"
                            style={{ color: "var(--c-red)" }}
                          >
                            undo
                          </button>
                        ) : canEditDocument && onEditDocument ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onEditDocument(row);
                            }}
                            aria-label={`Edit document ${virtualRow.index + 1}`}
                            title="Edit document"
                            className="text-quiet-foreground hover:text-foreground"
                          >
                            <Pencil className="h-2.5 w-2.5" />
                          </button>
                        ) : (
                          canAddRow && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                duplicateRow(row);
                              }}
                              aria-label={`Duplicate row ${virtualRow.index + 1}`}
                              title="Duplicate row"
                              className="text-quiet-foreground hover:text-foreground"
                            >
                              <CopyPlus className="h-2.5 w-2.5" />
                            </button>
                          )
                        )}
                        <span className={markedForDelete ? "line-through" : undefined}>
                          {virtualRow.index + 1}
                        </span>
                      </div>
                    </td>
                    {rowPage.columns.map((columnName) => {
                      const meta = columnByName.get(columnName);
                      const reference =
                        meta?.isForeignKey && onNavigateToForeignKey ? meta.references : undefined;
                      const editorCapability = meta
                        ? mutationEditorCapability(meta.dataType, engine, meta)
                        : undefined;
                      // FK-with-navigation and PK-with-filter-click keep their existing single-click
                      // behavior even when this column is otherwise editable - PK columns are never
                      // in `editableColumns` in the first place (F103), so only the FK case actually
                      // needs this explicit precedence check.
                      const isEditableCell =
                        editable &&
                        !reference &&
                        !meta?.isPrimaryKey &&
                        editableColumns?.has(columnName) &&
                        pendingChanges &&
                        primaryKeyColumns &&
                        !markedForDelete;
                      const staged =
                        isEditableCell && rowKey
                          ? pendingChanges.getEdit(rowKey, columnName)
                          : undefined;
                      const cellId = rowKey ? `${rowKey}:${columnName}` : undefined;
                      const cellSelected =
                        selectedCell?.rowIndex === virtualRow.index &&
                        selectedCell.column === columnName;
                      const cellActive = Boolean(cellId && activeEditor === cellId);
                      return (
                        <td
                          key={columnName}
                          data-editor-id={isEditableCell ? cellId : undefined}
                          title={
                            editable && !meta?.isPrimaryKey && !reference
                              ? editorCapability?.unavailableReason
                              : undefined
                          }
                          className={cn(
                            "relative overflow-hidden border-r border-border-subtle px-3 py-1.5 text-foreground/80",
                            markedForDelete && "line-through opacity-60",
                            (cellSelected || cellActive) && "ring-1 ring-inset ring-primary",
                            cellActive && "bg-background"
                          )}
                        >
                          {isEditableCell && rowKey ? (
                            <EditableCell
                              cellId={cellId}
                              displayValue={staged ? staged.next : row[columnName]}
                              columnName={columnName}
                              dataType={meta?.dataType ?? "unknown"}
                              allowedValues={meta?.allowedValues}
                              elementDataType={meta?.elementDataType}
                              engine={engine}
                              nullable={meta?.nullable ?? true}
                              dirty={Boolean(staged)}
                              onInspect={(value) => setInspected({ column: columnName, value })}
                              onInspectDate={(value, anchorRect) =>
                                setDateInspected({ value, anchorRect })
                              }
                              onCommit={(next) =>
                                pendingChanges.stageEdit(rowKey, columnName, row[columnName], next)
                              }
                              onRevert={() => pendingChanges.revertEdit(rowKey, columnName)}
                              isActive={cellActive}
                              onActivate={() => setActiveEditor(cellId ?? null)}
                              onDeactivate={() =>
                                setActiveEditor((current) => (current === cellId ? null : current))
                              }
                              isSelected={cellSelected}
                              onSelect={() =>
                                setSelectedCell({ rowIndex: virtualRow.index, column: columnName })
                              }
                              onCommitKey={(direction) =>
                                moveSelection(virtualRow.index, columnName, direction)
                              }
                            />
                          ) : row[columnName] === null || row[columnName] === undefined ? (
                            <span className="italic text-quiet-foreground">null</span>
                          ) : reference ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onNavigateToForeignKey?.(reference, row[columnName]);
                              }}
                              title={`Go to ${reference.table}.${reference.column}`}
                              className="block max-w-full truncate underline decoration-dotted underline-offset-2 hover:text-primary"
                              style={{ color: "var(--c-blue)" }}
                            >
                              {truncateForDisplay(formatCell(row[columnName]))}
                            </button>
                          ) : meta?.isPrimaryKey && onFiltersChange ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                filterToPrimaryKeyValue(columnName, row[columnName]);
                              }}
                              title={`Filter to this row (${columnName})`}
                              className="block max-w-full truncate underline decoration-dotted underline-offset-2 hover:text-primary"
                              style={{ color: "var(--c-amber)" }}
                            >
                              {truncateForDisplay(formatCell(row[columnName]))}
                            </button>
                          ) : (
                            <CellValue
                              value={row[columnName]}
                              dataType={meta?.dataType}
                              onInspect={(value) => setInspected({ column: columnName, value })}
                              onInspectDate={(value, anchorRect) =>
                                setDateInspected({ value, anchorRect })
                              }
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {bottomPadding > 0 && (
                <tr>
                  <td colSpan={rowPage.columns.length + 2} style={{ height: bottomPadding }} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <RowsTableFooter
        visibleCount={filtered.length}
        approxRowCount={approxRowCount}
        tableName={tableName}
        page={page}
        canGoPrevious={canGoPrevious}
        canGoNext={canGoNext}
        onPrevious={onPrevious}
        onNext={onNext}
      />

      {inspected && (
        <CellValueDrawer
          column={inspected.column}
          value={inspected.value}
          onClose={() => setInspected(null)}
        />
      )}

      {dateInspected && (
        <DateDetailPopover
          value={dateInspected.value}
          anchorRect={dateInspected.anchorRect}
          onClose={() => setDateInspected(null)}
        />
      )}
    </div>
  );
}
