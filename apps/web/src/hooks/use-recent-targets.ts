import type { RecentTarget } from "@humbdb/ui";
import { useCallback, useState } from "react";

const STORAGE_KEY = "humb-recent-targets";
const MAX_ENTRIES = 5;

function readEntries(): RecentTarget[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecentTarget[]) : [];
  } catch {
    return [];
  }
}

/**
 * Tracks the last MAX_ENTRIES successfully-connected targets in localStorage (F064), most recent
 * first, so switching back is one click instead of a retype - same bounded-list shape Query
 * History (F012) already uses. `display` is the already-redacted string the server's
 * POST /api/connect response returns, not re-derived here - this package must not duplicate
 * @humbdb/core's redaction logic (a real value import from that barrel previously broke Vite's
 * browser build, see F047's history).
 */
export function useRecentTargets(): {
  entries: RecentTarget[];
  record: (raw: string, display: string) => void;
} {
  const [entries, setEntries] = useState<RecentTarget[]>(readEntries);

  const record = useCallback((raw: string, display: string) => {
    setEntries((current) => {
      const withoutExisting = current.filter((entry) => entry.raw !== raw);
      const next = [{ raw, display }, ...withoutExisting].slice(0, MAX_ENTRIES);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { entries, record };
}
