import { useCallback, useState } from "react";

export type SchemaView = "graph" | "grid";

const STORAGE_KEY = "qyre-schema-view";

/** Remembers whether the Schema tab shows the interactive graph (F074) or the card grid, persisted
 * to localStorage like the theme. Graph is the default. */
export function useSchemaView(): { view: SchemaView; setView: (view: SchemaView) => void } {
  const [view, setViewState] = useState<SchemaView>(() =>
    localStorage.getItem(STORAGE_KEY) === "grid" ? "grid" : "graph"
  );

  const setView = useCallback((next: SchemaView) => {
    setViewState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  return { view, setView };
}
