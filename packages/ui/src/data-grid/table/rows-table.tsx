import { ArrowUpDown, CopyPlus, Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../cn.js";
import { formatCell, friendlyTypeLabel } from "../../primitives/format-cell.js";
import { TypeIcon } from "../../primitives/type-icon.js";
import { CellValueDrawer } from "../cells/cell-value-drawer.js";
import { CellValue } from "../cells/cell-value.js";
import { DateDetailPopover } from "../cells/date-detail-popover.js";
import { EditableCell } from "../cells/editable-cell.js";
import { NewRowCell } from "../cells/new-row-cell.js";
import { computeRowKey, DEFAULT_EXPORT_FORMATS, toCsv } from "./row-export.js";
import type { RowsTableProps } from "./rows-table-types.js";
import { RowsTableFooter } from "./rows-table-footer.js";
import { RowsTableToolbar } from "./rows-table-toolbar.js";
import { useRowsTableModel } from "./use-rows-table.js";

export { toCsv };
export type { RowsTableProps };

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
        <div data-testid="rows-table" ref={scrollRef} className="flex-1 overflow-auto">
          <table className="w-full border-collapse font-mono text-[11px]">
            <thead className="sticky top-0 z-10 bg-card">
              <tr>
                <th className="w-8 border-b border-r border-border px-2 py-2 text-center">
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
                <th
                  className={cn(
                    "border-b border-r border-border px-2 py-2 text-right font-normal text-muted-foreground/40",
                    canAddRow ? "w-14" : "w-8"
                  )}
                >
                  #
                </th>
                {rowPage.columns.map((columnName) => {
                  const meta = columnByName.get(columnName);
                  return (
                    <th
                      key={columnName}
                      onClick={onSortChange ? () => handleSort(columnName) : undefined}
                      className={cn(
                        "group whitespace-nowrap border-b border-r border-border px-3 py-1.5 text-left font-medium text-muted-foreground",
                        onSortChange ? "cursor-pointer hover:text-foreground" : undefined
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        {columnName}
                        {onSortChange && (
                          <ArrowUpDown
                            className={cn(
                              "h-2.5 w-2.5 transition-opacity",
                              sortColumn === columnName
                                ? "text-primary opacity-100"
                                : "opacity-0 group-hover:opacity-40"
                            )}
                          />
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 font-mono text-[9px] font-normal text-muted-foreground/60">
                        {meta && <TypeIcon dataType={meta.dataType} />}
                        <span>{meta ? friendlyTypeLabel(meta.dataType) : "unknown"}</span>
                        {meta?.isPrimaryKey && (
                          <span className="font-bold" style={{ color: "var(--c-amber)" }}>
                            PK
                          </span>
                        )}
                        {meta?.isForeignKey && (
                          <span className="font-bold" style={{ color: "var(--c-blue)" }}>
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
                      return (
                        <td
                          key={columnName}
                          className="whitespace-nowrap border-r border-border-subtle px-3 py-1.5"
                        >
                          {isInsertable ? (
                            <NewRowCell
                              value={insert.values[columnName]}
                              dataType={meta?.dataType ?? "unknown"}
                              engine={engine}
                              nullable={meta?.nullable ?? true}
                              onChange={(next) =>
                                pendingChanges.updateInsertValue(insert.id, columnName, next)
                              }
                            />
                          ) : (
                            <span className="italic text-muted-foreground/30">not editable</span>
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
                        "border-r border-border-subtle px-1 py-1.5 text-right text-muted-foreground/30",
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
                            className="text-muted-foreground/60 hover:text-foreground"
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
                              className="text-muted-foreground/60 hover:text-foreground"
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
                      return (
                        <td
                          key={columnName}
                          className={cn(
                            "whitespace-nowrap border-r border-border-subtle px-3 py-1.5 text-foreground/80",
                            markedForDelete && "line-through opacity-60"
                          )}
                        >
                          {isEditableCell && rowKey ? (
                            <EditableCell
                              displayValue={staged ? staged.next : row[columnName]}
                              dataType={meta?.dataType ?? "unknown"}
                              engine={engine}
                              nullable={meta?.nullable ?? true}
                              dirty={Boolean(staged)}
                              onCommit={(next) =>
                                pendingChanges.stageEdit(rowKey, columnName, row[columnName], next)
                              }
                              onRevert={() => pendingChanges.revertEdit(rowKey, columnName)}
                            />
                          ) : row[columnName] === null || row[columnName] === undefined ? (
                            <span className="italic text-muted-foreground/30">null</span>
                          ) : reference ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onNavigateToForeignKey?.(reference, row[columnName]);
                              }}
                              title={`Go to ${reference.table}.${reference.column}`}
                              className="underline decoration-dotted underline-offset-2 hover:text-primary"
                              style={{ color: "var(--c-blue)" }}
                            >
                              {formatCell(row[columnName])}
                            </button>
                          ) : meta?.isPrimaryKey && onFiltersChange ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                filterToPrimaryKeyValue(columnName, row[columnName]);
                              }}
                              title={`Filter to this row (${columnName})`}
                              className="underline decoration-dotted underline-offset-2 hover:text-primary"
                              style={{ color: "var(--c-amber)" }}
                            >
                              {formatCell(row[columnName])}
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
