import type { RecentTarget } from "@qyre/ui";
import { useCallback, useState } from "react";
import {
  readVersionedStorage,
  removeStoredValue,
  writeVersionedStorage
} from "../../../shared/lib/storage/versioned-storage.js";
import { canPersistTarget, nextRecentTargets, parseRecentTargets } from "./recent-targets.js";

const STORAGE = {
  key: "qyre-recent-targets",
  version: 1,
  parse: parseRecentTargets
};

function readEntries(): RecentTarget[] {
  const entries = readVersionedStorage(localStorage, STORAGE, []);
  writeVersionedStorage(localStorage, STORAGE, entries);
  return entries;
}

/**
 * Tracks the last five successfully-connected targets, most recent first. Credential-bearing URLs
 * remain available for the current browser session but are never persisted; safe URLs and file
 * paths use versioned local storage. `display` is the already-redacted string the server's
 * POST /api/connect response returns, not re-derived here - this package must not duplicate
 * @qyre/core's redaction logic (a real value import from that barrel previously broke Vite's
 * browser build, see F047's history).
 */
export function useRecentTargets(): {
  entries: RecentTarget[];
  record: (raw: string, display: string) => void;
  clear: () => void;
} {
  const [entries, setEntries] = useState<RecentTarget[]>(readEntries);

  const record = useCallback((raw: string, display: string) => {
    setEntries((current) => {
      const next = nextRecentTargets(current, { raw, display });
      writeVersionedStorage(
        localStorage,
        STORAGE,
        next.filter((entry) => canPersistTarget(entry.raw))
      );
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    removeStoredValue(localStorage, STORAGE.key);
    setEntries([]);
  }, []);

  return { entries, record, clear };
}
