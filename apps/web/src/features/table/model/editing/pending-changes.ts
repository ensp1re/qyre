import { useCallback, useMemo, useRef, useState } from "react";

export interface StagedEdit {
  readonly original: unknown;
  readonly next: unknown;
}

export type PendingEdits = ReadonlyMap<string, ReadonlyMap<string, StagedEdit>>;

export interface PendingInsertRow {
  readonly id: string;
  readonly values: Readonly<Record<string, unknown>>;
}

export type PendingInserts = readonly PendingInsertRow[];

export interface PendingChangesApi {
  edits: PendingEdits;
  getEdit: (rowKey: string, column: string) => StagedEdit | undefined;
  stageEdit: (rowKey: string, column: string, original: unknown, next: unknown) => void;
  revertEdit: (rowKey: string, column: string) => void;
  clear: () => void;
  size: number;
  inserts: PendingInserts;
  addInsert: (initialValues?: Record<string, unknown>) => string;
  updateInsertValue: (id: string, column: string, value: unknown) => void;
  removeInsert: (id: string) => void;
  deletes: ReadonlySet<string>;
  stageDelete: (rowKey: string) => void;
  unstageDelete: (rowKey: string) => void;
}

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

export function countPendingEdits(edits: PendingEdits): number {
  let total = 0;
  for (const rowEdits of edits.values()) total += rowEdits.size;
  return total;
}

export function applyAddInsert(
  inserts: PendingInserts,
  id: string,
  initialValues: Record<string, unknown> = {}
): PendingInserts {
  return [...inserts, { id, values: initialValues }];
}

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

export function applyRemoveInsert(inserts: PendingInserts, id: string): PendingInserts {
  return inserts.filter((insert) => insert.id !== id);
}

export function applyStageDelete(
  deletes: ReadonlySet<string>,
  rowKey: string
): ReadonlySet<string> {
  if (deletes.has(rowKey)) return deletes;
  const next = new Set(deletes);
  next.add(rowKey);
  return next;
}

export function applyUnstageDelete(
  deletes: ReadonlySet<string>,
  rowKey: string
): ReadonlySet<string> {
  if (!deletes.has(rowKey)) return deletes;
  const next = new Set(deletes);
  next.delete(rowKey);
  return next;
}

export function applyRemoveRowEdits(edits: PendingEdits, rowKey: string): PendingEdits {
  if (!edits.has(rowKey)) return edits;
  const next = new Map(edits);
  next.delete(rowKey);
  return next;
}

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

export function computeRowKey(
  row: Record<string, unknown>,
  primaryKeyColumns: readonly string[]
): string {
  return JSON.stringify([...primaryKeyColumns].sort().map((column) => [column, row[column]]));
}
