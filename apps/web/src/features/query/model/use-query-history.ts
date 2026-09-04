import type { StatementClassification } from "@qyre/core";
import type { QueryHistoryEntry } from "@qyre/ui";
import { useCallback, useState } from "react";
import {
  readVersionedStorage,
  removeStoredValue,
  writeVersionedStorage
} from "../../../shared/lib/storage/versioned-storage.js";

const MAX_ENTRIES = 50;
const STORAGE = {
  key: "qyre-query-history",
  version: 1,
  parse: parseEntries
};

function readEntries(): QueryHistoryEntry[] {
  return readVersionedStorage(localStorage, STORAGE, []);
}

export function useQueryHistory(): {
  entries: QueryHistoryEntry[];
  record: (sql: string, classification?: StatementClassification) => void;
  clear: () => void;
} {
  const [entries, setEntries] = useState<QueryHistoryEntry[]>(readEntries);

  const record = useCallback((sql: string, classification?: StatementClassification) => {
    const trimmed = sql.trim();
    if (!trimmed) return;

    setEntries((current) => {
      const withoutExisting = current.filter((entry) => entry.sql !== trimmed);
      const next = [{ sql: trimmed, ranAt: Date.now(), classification }, ...withoutExisting].slice(
        0,
        MAX_ENTRIES
      );
      writeVersionedStorage(localStorage, STORAGE, next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    removeStoredValue(localStorage, STORAGE.key);
    setEntries([]);
  }, []);

  return { entries, record, clear };
}

function parseEntries(value: unknown): QueryHistoryEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter(
      (entry): entry is QueryHistoryEntry =>
        typeof entry === "object" &&
        entry !== null &&
        "sql" in entry &&
        typeof entry.sql === "string" &&
        "ranAt" in entry &&
        typeof entry.ranAt === "number"
    )
    .slice(0, MAX_ENTRIES);
}
