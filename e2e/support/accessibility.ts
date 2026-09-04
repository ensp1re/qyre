import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

const THEMES = ["dark", "light"] as const;

/** Enforces the WCAG A/AA baseline against the same surface in both supported themes. */
export async function expectNoAccessibilityViolations(page: Page, surface: string): Promise<void> {
  const startedDark = await page.evaluate(() =>
    document.documentElement.classList.contains("dark")
  );

  try {
    for (const theme of THEMES) {
      await page.evaluate(
        (dark) => document.documentElement.classList.toggle("dark", dark),
        theme === "dark"
      );
      // Wait for the theme transition before scanning.
      await page.waitForTimeout(250);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(
        results.violations,
        `${surface} (${theme})\n${JSON.stringify(results.violations, null, 2)}`
      ).toEqual([]);
    }
  } finally {
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      startedDark
    );
  }
}
