import { useCallback, useState } from "react";

/** Reads/writes one numeric panel size (px) to localStorage under `key`, mirroring use-theme.ts's
 * persistence pattern (F071 - resizable sidebar/results panels). */
export function usePanelSize(key: string, defaultSize: number): [number, (size: number) => void] {
  const [size, setSizeState] = useState<number>(() => {
    const stored = localStorage.getItem(key);
    const parsed = stored === null ? NaN : Number(stored);
    return Number.isFinite(parsed) ? parsed : defaultSize;
  });

  const setSize = useCallback(
    (next: number) => {
      setSizeState(next);
      localStorage.setItem(key, String(next));
    },
    [key]
  );

  return [size, setSize];
}
