import { useCallback, useMemo, useState } from "react";

export interface StagedEdit {
  readonly original: unknown;
  readonly next: unknown;
}

export type PendingEdits = ReadonlyMap<string, ReadonlyMap<string, StagedEdit>>;

export interface PendingChangesApi {
  getEdit: (rowKey: string, column: string) => StagedEdit | undefined;
  stageEdit: (rowKey: string, column: string, original: unknown, next: unknown) => void;
  revertEdit: (rowKey: string, column: string) => void;
  clear: () => void;
  /** Total staged cell edits across every row - 0 when the buffer is empty. */
  size: number;
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

  const clear = useCallback(() => setEdits(new Map()), []);

  const size = useMemo(() => countPendingEdits(edits), [edits]);

  return { getEdit, stageEdit, revertEdit, clear, size };
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
