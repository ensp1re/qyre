import {
  readVersionedStorage,
  removeStoredValue,
  type StorageLike,
  writeVersionedStorage
} from "../../../../src/shared/lib/storage/versioned-storage.js";
import { describe, expect, it } from "vitest";

const config = {
  key: "setting",
  version: 2,
  parse: (value: unknown) => (typeof value === "number" ? value : undefined)
};

describe("versioned storage", () => {
  it("reads current envelopes and legacy JSON values", () => {
    const current = memoryStorage({ setting: JSON.stringify({ version: 2, value: 42 }) });
    const legacy = memoryStorage({ setting: "21" });

    expect(readVersionedStorage(current, config, 0)).toBe(42);
    expect(readVersionedStorage(legacy, config, 0)).toBe(21);
  });

  it("rejects unknown versions and malformed values", () => {
    const future = memoryStorage({ setting: JSON.stringify({ version: 3, value: 42 }) });
    const malformed = memoryStorage({ setting: "not-json" });

    expect(readVersionedStorage(future, config, 7)).toBe(7);
    expect(readVersionedStorage(malformed, config, 7)).toBe(7);
  });

  it("writes an envelope and removes it safely", () => {
    const storage = memoryStorage();

    writeVersionedStorage(storage, config, 9);
    expect(storage.getItem("setting")).toBe(JSON.stringify({ version: 2, value: 9 }));
    removeStoredValue(storage, "setting");
    expect(storage.getItem("setting")).toBeNull();
  });
});

function memoryStorage(initial: Record<string, string> = {}): StorageLike {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}
