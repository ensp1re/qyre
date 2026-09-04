import { useCallback, useState } from "react";
import {
  readVersionedStorage,
  writeVersionedStorage
} from "../../../shared/lib/storage/versioned-storage.js";

export type SchemaView = "graph" | "grid";

const STORAGE = {
  key: "qyre-schema-view",
  version: 1,
  parse: (value: unknown): SchemaView | undefined =>
    value === "graph" || value === "grid" ? value : undefined,
  parseLegacyRaw: (raw: string): SchemaView | undefined =>
    raw === "graph" || raw === "grid" ? raw : undefined
};

export function useSchemaView(): { view: SchemaView; setView: (view: SchemaView) => void } {
  const [view, setViewState] = useState<SchemaView>(() =>
    readVersionedStorage(localStorage, STORAGE, "graph")
  );

  const setView = useCallback((next: SchemaView) => {
    setViewState(next);
    writeVersionedStorage(localStorage, STORAGE, next);
  }, []);

  return { view, setView };
}
