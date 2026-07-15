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

/** Remembers whether the Tables tab shows the row browser or F114's Structure view, persisted to
 * localStorage like `useSchemaView`'s graph/grid choice - `TablesTab` remounts on every table switch
 * by design (see its own doc comment), so this needs to survive that remount rather than reset to
 * the default each time. Rows is the default. */
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
