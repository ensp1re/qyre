import type { QueryHistoryEntry } from "@humbdb/ui";
import { useCallback, useState } from "react";

const STORAGE_KEY = "humb-query-history";
const MAX_ENTRIES = 50;

function readEntries(): QueryHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueryHistoryEntry[]) : [];
  } catch {
    return [];
  }
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { entries, record };
}
