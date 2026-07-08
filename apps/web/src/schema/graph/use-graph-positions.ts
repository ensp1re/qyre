import { useCallback, useState } from "react";

/** A saved `{ x, y }` per node id. */
export type SavedPositions = Record<string, { x: number; y: number }>;

/** localStorage key for a given database's saved node layout - namespaced per database so each
 * connection remembers its own arrangement (F074). */
function storageKey(databaseKey: string): string {
  return `qyre-schema-graph-positions:${databaseKey}`;
}

/**
 * Reads/writes the schema graph's node positions to localStorage, keyed per database. Returns the
 * currently-saved positions, a setter that merges + persists a batch of moves, and a `clear` for
 * the "Reset layout" control. Mirrors `usePanelSize`'s persistence pattern.
 */
export function useGraphPositions(databaseKey: string): {
  positions: SavedPositions;
  savePositions: (updates: SavedPositions) => void;
  clearPositions: () => void;
} {
  const [positions, setPositions] = useState<SavedPositions>(() => read(databaseKey));

  const savePositions = useCallback(
    (updates: SavedPositions) => {
      setPositions((current) => {
        const next = { ...current, ...updates };
        try {
          localStorage.setItem(storageKey(databaseKey), JSON.stringify(next));
        } catch {
          // localStorage can throw (quota/private mode) - a non-persisted layout is acceptable,
          // the graph still works this session.
        }
        return next;
      });
    },
    [databaseKey]
  );

  const clearPositions = useCallback(() => {
    setPositions({});
    try {
      localStorage.removeItem(storageKey(databaseKey));
    } catch {
      // ignore - see savePositions.
    }
  }, [databaseKey]);

  return { positions, savePositions, clearPositions };
}

function read(databaseKey: string): SavedPositions {
  try {
    const raw = localStorage.getItem(storageKey(databaseKey));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as SavedPositions) : {};
  } catch {
    return {};
  }
}
