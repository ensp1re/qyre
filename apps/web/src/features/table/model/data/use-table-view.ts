import { useCallback, useState } from "react";
import {
  readVersionedStorage,
  writeVersionedStorage
} from "../../../../shared/lib/storage/versioned-storage.js";

export type TableView = "rows" | "structure";

const STORAGE = {
  key: "qyre-table-view",
  version: 1,
  parse: (value: unknown): TableView | undefined =>
    value === "rows" || value === "structure" ? value : undefined
};

export function useTableView(): { view: TableView; setView: (view: TableView) => void } {
  const [view, setViewState] = useState<TableView>(() =>
    readVersionedStorage(localStorage, STORAGE, "rows")
  );

  const setView = useCallback((next: TableView) => {
    setViewState(next);
    writeVersionedStorage(localStorage, STORAGE, next);
  }, []);

  return { view, setView };
}
