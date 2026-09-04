import { useCallback, useState } from "react";
import {
  readVersionedStorage,
  removeStoredValue,
  writeVersionedStorage
} from "../../../shared/lib/storage/versioned-storage.js";

export type SavedPositions = Record<string, { x: number; y: number }>;

function storageKey(databaseKey: string): string {
  return `qyre-schema-graph-positions:${databaseKey}`;
}

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
        writeVersionedStorage(localStorage, storageConfig(databaseKey), next);
        return next;
      });
    },
    [databaseKey]
  );

  const clearPositions = useCallback(() => {
    setPositions({});
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
