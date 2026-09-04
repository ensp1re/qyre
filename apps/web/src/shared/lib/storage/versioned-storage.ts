export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export interface VersionedStorageConfig<T> {
  key: string;
  version: number;
  parse: (value: unknown) => T | undefined;
  parseLegacyRaw?: (raw: string) => T | undefined;
}

export function readVersionedStorage<T>(
  storage: StorageLike,
  config: VersionedStorageConfig<T>,
  fallback: T
): T {
  try {
    const raw = storage.getItem(config.key);
    if (raw === null) return fallback;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return config.parseLegacyRaw?.(raw) ?? fallback;
    }

    if (isEnvelope(parsed)) {
      if (parsed.version !== config.version) return fallback;
      return config.parse(parsed.value) ?? fallback;
    }

    return config.parse(parsed) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeVersionedStorage<T>(
  storage: StorageLike,
  config: Pick<VersionedStorageConfig<T>, "key" | "version">,
  value: T
): void {
  try {
    storage.setItem(config.key, JSON.stringify({ version: config.version, value }));
  } catch {
    // Storage persistence is best effort.
  }
}

export function removeStoredValue(storage: StorageLike, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Storage persistence is best effort.
  }
}

export function writeRawStorage(storage: StorageLike, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // Storage persistence is best effort.
  }
}

function isEnvelope(value: unknown): value is { version: number; value: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    typeof value.version === "number" &&
    "value" in value
  );
}
