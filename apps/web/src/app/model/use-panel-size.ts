import { useCallback, useState } from "react";
import {
  readVersionedStorage,
  writeVersionedStorage
} from "../../shared/lib/storage/versioned-storage.js";

export function usePanelSize(key: string, defaultSize: number): [number, (size: number) => void] {
  const storage = {
    key,
    version: 1,
    parse: (value: unknown) =>
      typeof value === "number" && Number.isFinite(value) ? value : undefined,
    parseLegacyRaw: (raw: string) => {
      const value = Number(raw);
      return Number.isFinite(value) ? value : undefined;
    }
  };
  const [size, setSizeState] = useState<number>(() =>
    readVersionedStorage(localStorage, storage, defaultSize)
  );

  const setSize = useCallback(
    (next: number) => {
      setSizeState(next);
      writeVersionedStorage(localStorage, storage, next);
    },
    [key]
  );

  return [size, setSize];
}
