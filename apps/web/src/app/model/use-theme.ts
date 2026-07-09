import { useCallback, useState } from "react";
import { writeRawStorage } from "../../shared/lib/storage/versioned-storage.js";

export type Theme = "light" | "dark";

const STORAGE_KEY = "qyre-theme";

function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Reads/writes the `.dark` class set pre-paint by index.html's inline script, persisting to localStorage. */
export function useTheme(): {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
} {
  const [theme, setThemeState] = useState<Theme>(currentTheme);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.classList.toggle("dark", next === "dark");
    // Kept raw because index.html reads this value before React mounts to prevent theme flash.
    writeRawStorage(localStorage, STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      writeRawStorage(localStorage, STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { theme, toggleTheme, setTheme };
}
