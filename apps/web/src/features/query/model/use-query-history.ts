import type { QueryHistoryEntry } from "@qyre/ui";
import { useCallback, useState } from "react";
import {
  readVersionedStorage,
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

/**
 * Tracks successful SQL Editor queries in localStorage (F012), most recent first, capped at
 * MAX_ENTRIES. Re-running a query that's already in history moves it to the front instead of
 * appending a duplicate card. Shared across every connected database, not scoped per connection -
 * see docs/product-specs/sql-editor.md.
 */
export function useQueryHistory(): {
  entries: QueryHistoryEntry[];
  record: (sql: string) => void;
} {
  const [entries, setEntries] = useState<QueryHistoryEntry[]>(readEntries);

  const record = useCallback((sql: string) => {
    const trimmed = sql.trim();
    if (!trimmed) return;

    setEntries((current) => {
      const withoutExisting = current.filter((entry) => entry.sql !== trimmed);
      const next = [{ sql: trimmed, ranAt: Date.now() }, ...withoutExisting].slice(0, MAX_ENTRIES);
      writeVersionedStorage(localStorage, STORAGE, next);
      return next;
    });
  }, []);

  return { entries, record };
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
