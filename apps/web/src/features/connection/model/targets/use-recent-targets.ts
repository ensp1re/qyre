import type { RecentTarget } from "@qyre/ui";
import { useCallback, useState } from "react";
import {
  readVersionedStorage,
  removeStoredValue,
  writeVersionedStorage
} from "../../../../shared/lib/storage/versioned-storage.js";
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
