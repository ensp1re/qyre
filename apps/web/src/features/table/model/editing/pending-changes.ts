import { useCallback, useMemo, useRef, useState } from "react";

export interface StagedEdit {
  readonly original: unknown;
  readonly next: unknown;
}

export type PendingEdits = ReadonlyMap<string, ReadonlyMap<string, StagedEdit>>;

/** One staged new-row draft (F104) - `values` only holds columns the user actually touched; an
 * omitted column lets the engine apply its own default/auto-generated value on commit, rather than
 * the UI guessing one (see `docs/product-specs/row-editing.md`'s auto-generated-primary-key note,
 * generalized to every column). */
export interface PendingInsertRow {
  readonly id: string;
  readonly values: Readonly<Record<string, unknown>>;
}

export type PendingInserts = readonly PendingInsertRow[];

export interface PendingChangesApi {
  /** Every staged cell edit, keyed by row then column - exposed (not just `getEdit`) so a commit
   * flow (F105) can build one update op per dirty row. */
  edits: PendingEdits;
  getEdit: (rowKey: string, column: string) => StagedEdit | undefined;
  stageEdit: (rowKey: string, column: string, original: unknown, next: unknown) => void;
  revertEdit: (rowKey: string, column: string) => void;
  clear: () => void;
  /** Total staged cell edits across every row - 0 when the buffer is empty. */
  size: number;
  /** Staged new-row drafts (F104), in the order they were added. */
  inserts: PendingInserts;
  /** Stages a new draft row, optionally pre-filled (Duplicate row) - returns its id. */
  addInsert: (initialValues?: Record<string, unknown>) => string;
  /** Sets (or, given `undefined`, clears) one column's value on a draft row. */
  updateInsertValue: (id: string, column: string, value: unknown) => void;
  /** Discards a whole draft row. */
  removeInsert: (id: string) => void;
  /** Rows staged for deletion (F105), by row key. */
  deletes: ReadonlySet<string>;
  /** Stages a row for deletion - the caller's own confirming click IS the explicit per-delete
   * confirmation `docs/product-specs/row-editing.md` requires; this call itself is never
   * conditional/implicit. Drops any staged cell edit for that row - editing a row about to be
   * deleted has no meaning. */
  stageDelete: (rowKey: string) => void;
  /** Un-stages a row's deletion. */
  unstageDelete: (rowKey: string) => void;
}

/** Pure state transition backing `stageEdit` - a plain function so it's unit-testable without
 * rendering `usePendingChanges` itself (apps/web has no React-testing harness set up; every other
 * test here is plain-function logic, matching that precedent rather than adding one for a single
 * hook). */
export function applyStageEdit(
  edits: PendingEdits,
  rowKey: string,
  column: string,
  original: unknown,
  next: unknown
): PendingEdits {
  const nextMap = new Map(edits);
  const rowEdits = new Map(nextMap.get(rowKey));
  rowEdits.set(column, { original, next });
  nextMap.set(rowKey, rowEdits);
  return nextMap;
}

/** Pure state transition backing `revertEdit` - see {@link applyStageEdit}. Returns the same `edits`
 * reference when there's nothing to revert, so callers can skip a re-render. */
export function applyRevertEdit(edits: PendingEdits, rowKey: string, column: string): PendingEdits {
  const rowEdits = edits.get(rowKey);
  if (!rowEdits?.has(column)) return edits;
  const nextMap = new Map(edits);
  const nextRowEdits = new Map(rowEdits);
  nextRowEdits.delete(column);
  if (nextRowEdits.size === 0) nextMap.delete(rowKey);
  else nextMap.set(rowKey, nextRowEdits);
  return nextMap;
}

/** Total staged cell edits across every row. */
export function countPendingEdits(edits: PendingEdits): number {
  let total = 0;
  for (const rowEdits of edits.values()) total += rowEdits.size;
  return total;
}

/** Pure state transition backing `addInsert` (F104) - appends a new draft row with the given id and
 * initial values (empty when adding a blank row; pre-filled when duplicating an existing row). */
export function applyAddInsert(
  inserts: PendingInserts,
  id: string,
  initialValues: Record<string, unknown> = {}
): PendingInserts {
  return [...inserts, { id, values: initialValues }];
}

/** Pure state transition backing `updateInsertValue` - see {@link applyStageEdit}. Setting `value`
 * to `undefined` removes the column from `values` entirely (back to "untouched"), rather than
 * storing an explicit `undefined`, so an untouched column stays indistinguishable from one the user
 * never visited. */
export function applyUpdateInsertValue(
  inserts: PendingInserts,
  id: string,
  column: string,
  value: unknown
): PendingInserts {
  return inserts.map((insert) => {
    if (insert.id !== id) return insert;
    const values = { ...insert.values };
    if (value === undefined) delete values[column];
    else values[column] = value;
    return { ...insert, values };
  });
}

/** Pure state transition backing `removeInsert` - discards a whole draft row. */
export function applyRemoveInsert(inserts: PendingInserts, id: string): PendingInserts {
  return inserts.filter((insert) => insert.id !== id);
}

/** Pure state transition backing `stageDelete` (F105). */
export function applyStageDelete(
  deletes: ReadonlySet<string>,
  rowKey: string
): ReadonlySet<string> {
  if (deletes.has(rowKey)) return deletes;
  const next = new Set(deletes);
  next.add(rowKey);
  return next;
}

/** Pure state transition backing `unstageDelete` - see {@link applyStageDelete}. */
export function applyUnstageDelete(
  deletes: ReadonlySet<string>,
  rowKey: string
): ReadonlySet<string> {
  if (!deletes.has(rowKey)) return deletes;
  const next = new Set(deletes);
  next.delete(rowKey);
  return next;
}

/** Drops every staged cell edit for one row - used when a row is staged for deletion, since editing
 * a row about to be deleted has no meaning. Returns the same `edits` reference when the row had no
 * staged edits. */
export function applyRemoveRowEdits(edits: PendingEdits, rowKey: string): PendingEdits {
  if (!edits.has(rowKey)) return edits;
  const next = new Map(edits);
  next.delete(rowKey);
  return next;
}

/**
 * Client-side pending-changes buffer for the SQL editable grid (F103): edits stage here without
 * touching the server. Commit wiring (F105) reads from this same buffer; this hook only owns the
 * staging/reverting itself. Keyed by an opaque row identity (see `computeRowKey`), not page
 * position, so a staged edit survives pagination/sort/filter changes as long as the row is still
 * addressable by its primary key.
 *
 * Scoped per open table: the caller resets the buffer by unmounting/remounting this hook's owner
 * (e.g. a `key={schema.table}` on the component that calls this) when the selected table changes -
 * per docs/product-specs/row-editing.md's "out of scope" note, switching tables simply doesn't
 * carry the buffer over, with no warning prompt.
 */
export function usePendingChanges(): PendingChangesApi {
  const [edits, setEdits] = useState<PendingEdits>(new Map());
  const [inserts, setInserts] = useState<PendingInserts>([]);
  const [deletes, setDeletes] = useState<ReadonlySet<string>>(new Set());
  const nextInsertId = useRef(0);

  const getEdit = useCallback(
    (rowKey: string, column: string) => edits.get(rowKey)?.get(column),
    [edits]
  );

  const stageEdit = useCallback(
    (rowKey: string, column: string, original: unknown, next: unknown) => {
      setEdits((current) => applyStageEdit(current, rowKey, column, original, next));
    },
    []
  );

  const revertEdit = useCallback((rowKey: string, column: string) => {
    setEdits((current) => applyRevertEdit(current, rowKey, column));
  }, []);

  const clear = useCallback(() => {
    setEdits(new Map());
    setInserts([]);
    setDeletes(new Set());
  }, []);

  const size = useMemo(() => countPendingEdits(edits), [edits]);

  const addInsert = useCallback((initialValues?: Record<string, unknown>) => {
    const id = `insert-${nextInsertId.current++}`;
    setInserts((current) => applyAddInsert(current, id, initialValues));
    return id;
  }, []);

  const updateInsertValue = useCallback((id: string, column: string, value: unknown) => {
    setInserts((current) => applyUpdateInsertValue(current, id, column, value));
  }, []);

  const removeInsert = useCallback((id: string) => {
    setInserts((current) => applyRemoveInsert(current, id));
  }, []);

  const stageDelete = useCallback((rowKey: string) => {
    setDeletes((current) => applyStageDelete(current, rowKey));
    setEdits((current) => applyRemoveRowEdits(current, rowKey));
  }, []);

  const unstageDelete = useCallback((rowKey: string) => {
    setDeletes((current) => applyUnstageDelete(current, rowKey));
  }, []);

  return {
    edits,
    getEdit,
    stageEdit,
    revertEdit,
    clear,
    size,
    inserts,
    addInsert,
    updateInsertValue,
    removeInsert,
    deletes,
    stageDelete,
    unstageDelete
  };
}

/** Stable identity for a row, derived from its primary-key column values - the buffer's key, and
 * how a staged edit is re-matched to the same logical row across re-fetches. Column order doesn't
 * matter (sorted), so callers don't need to agree on primary-key column order. */
export function computeRowKey(
  row: Record<string, unknown>,
  primaryKeyColumns: readonly string[]
): string {
  return JSON.stringify([...primaryKeyColumns].sort().map((column) => [column, row[column]]));
}
