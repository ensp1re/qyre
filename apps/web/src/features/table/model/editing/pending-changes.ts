import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  /** Held while a commit is in flight; outlives the Tables tab so a remount can't commit twice. */
  commitLock: { current: boolean };
  committing: boolean;
  setCommitting: (committing: boolean) => void;
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

interface ScopedPendingState {
  readonly scope: string | undefined;
  readonly edits: PendingEdits;
  readonly inserts: PendingInserts;
  readonly deletes: ReadonlySet<string>;
}

function emptyPendingState(scope: string | undefined): ScopedPendingState {
  return { scope, edits: new Map(), inserts: [], deletes: new Set() };
}

/**
 * Holds one table's staged changes. The buffer belongs to `scope` (connection target plus table):
 * a different scope always sees an empty buffer and the previous scope's changes are dropped.
 */
export function usePendingChanges(scope?: string): PendingChangesApi {
  const [state, setState] = useState<ScopedPendingState>(() => emptyPendingState(scope));
  const nextInsertId = useRef(0);
  const commitLock = useRef(false);
  const [committing, setCommittingState] = useState(false);
  const setCommitting = useCallback((value: boolean) => {
    commitLock.current = value;
    setCommittingState(value);
  }, []);
  const current = state.scope === scope ? state : emptyPendingState(scope);
  const { edits, inserts, deletes } = current;

  useEffect(() => {
    setState((previous) => (previous.scope === scope ? previous : emptyPendingState(scope)));
  }, [scope]);

  const update = useCallback(
    (apply: (previous: ScopedPendingState) => Partial<ScopedPendingState>) => {
      setState((previous) => {
        const base = previous.scope === scope ? previous : emptyPendingState(scope);
        return { ...base, ...apply(base) };
      });
    },
    [scope]
  );

  const getEdit = useCallback(
    (rowKey: string, column: string) => edits.get(rowKey)?.get(column),
    [edits]
  );

  const stageEdit = useCallback(
    (rowKey: string, column: string, original: unknown, next: unknown) => {
      update((previous) => ({
        edits: applyStageEdit(previous.edits, rowKey, column, original, next)
      }));
    },
    [update]
  );

  const revertEdit = useCallback(
    (rowKey: string, column: string) => {
      update((previous) => ({ edits: applyRevertEdit(previous.edits, rowKey, column) }));
    },
    [update]
  );

  // A commit that resolves after a table switch must not wipe the newer table's buffer.
  const clear = useCallback(() => {
    setState((previous) => (previous.scope === scope ? emptyPendingState(scope) : previous));
  }, [scope]);

  const size = useMemo(() => countPendingEdits(edits), [edits]);

  const addInsert = useCallback(
    (initialValues?: Record<string, unknown>) => {
      const id = `insert-${nextInsertId.current++}`;
      update((previous) => ({ inserts: applyAddInsert(previous.inserts, id, initialValues) }));
      return id;
    },
    [update]
  );

  const updateInsertValue = useCallback(
    (id: string, column: string, value: unknown) => {
      update((previous) => ({
        inserts: applyUpdateInsertValue(previous.inserts, id, column, value)
      }));
    },
    [update]
  );

  const removeInsert = useCallback(
    (id: string) => {
      update((previous) => ({ inserts: applyRemoveInsert(previous.inserts, id) }));
    },
    [update]
  );

  const stageDelete = useCallback(
    (rowKey: string) => {
      update((previous) => ({
        deletes: applyStageDelete(previous.deletes, rowKey),
        edits: applyRemoveRowEdits(previous.edits, rowKey)
      }));
    },
    [update]
  );

  const unstageDelete = useCallback(
    (rowKey: string) => {
      update((previous) => ({ deletes: applyUnstageDelete(previous.deletes, rowKey) }));
    },
    [update]
  );

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
    unstageDelete,
    commitLock,
    committing,
    setCommitting
  };
}

export function computeRowKey(
  row: Record<string, unknown>,
  primaryKeyColumns: readonly string[]
): string {
  return JSON.stringify([...primaryKeyColumns].sort().map((column) => [column, row[column]]));
}
