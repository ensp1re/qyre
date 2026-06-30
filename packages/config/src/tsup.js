/**
 * Shared tsup options for Humb library packages.
 * @param {import("tsup").Options} [overrides]
 * @returns {import("tsup").Options}
 */
export function libConfig(overrides = {}) {
  return {
    entry: ["src/index.ts"],
    format: ["esm"],
    target: "node20",
    dts: true,
    sourcemap: true,
    clean: true,
    ...overrides
  };
}
