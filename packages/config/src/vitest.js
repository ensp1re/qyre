/** @param {import("vitest/config").UserConfig} [overrides] @returns {import("vitest/config").UserConfig} */
export function testConfig(overrides = {}) {
  return {
    test: {
      environment: "node",
      passWithNoTests: true,
      ...overrides.test
    },
    ...overrides
  };
}
