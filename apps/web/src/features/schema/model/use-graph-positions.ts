import { useCallback, useEffect, useState } from "react";
import {
  readVersionedStorage,
  removeStoredValue,
  writeVersionedStorage
} from "../../../shared/lib/storage/versioned-storage.js";
import type { SavedPositions } from "./graph-types.js";

export type { SavedPositions } from "./graph-types.js";

function storageKey(databaseKey: string): string {
  return `qyre-schema-graph-positions:${databaseKey}`;
}

export function useGraphPositions(databaseKey: string): {
  positions: SavedPositions;
  savePositions: (updates: SavedPositions) => void;
  clearPositions: () => void;
} {
  const [state, setState] = useState(() => ({ databaseKey, positions: read(databaseKey) }));
  const positions = state.databaseKey === databaseKey ? state.positions : read(databaseKey);

  useEffect(() => {
    setState((current) =>
      current.databaseKey === databaseKey ? current : { databaseKey, positions: read(databaseKey) }
    );
  }, [databaseKey]);

  const savePositions = useCallback(
    (updates: SavedPositions) => {
      setState((current) => {
        const base = current.databaseKey === databaseKey ? current.positions : read(databaseKey);
        const next = { ...base, ...updates };
        writeVersionedStorage(localStorage, storageConfig(databaseKey), next);
        return { databaseKey, positions: next };
      });
    },
    [databaseKey]
  );

  const clearPositions = useCallback(() => {
    setState({ databaseKey, positions: {} });
    removeStoredValue(localStorage, storageKey(databaseKey));
  }, [databaseKey]);

  return { positions, savePositions, clearPositions };
}

function read(databaseKey: string): SavedPositions {
  return readVersionedStorage(localStorage, storageConfig(databaseKey), {});
}

function storageConfig(databaseKey: string) {
  return {
    key: storageKey(databaseKey),
    version: 1,
    parse: parsePositions
  };
}

function parsePositions(value: unknown): SavedPositions | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const positions = Object.entries(value).filter(
    (entry): entry is [string, { x: number; y: number }] =>
      typeof entry[1] === "object" &&
      entry[1] !== null &&
      "x" in entry[1] &&
      typeof entry[1].x === "number" &&
      "y" in entry[1] &&
      typeof entry[1].y === "number"
  );
  return Object.fromEntries(positions);
}
