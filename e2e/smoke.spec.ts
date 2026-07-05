import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Smoke test: no database required. Confirms the UI boots and the connection screen renders.
 * This is part of `pnpm test:e2e` and gates CI.
 */
test("@smoke the app boots and shows the connection screen", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Qyre" })).toBeVisible();
  await expect(page.getByTestId("status-badge")).toBeVisible();
  await expect(page.getByTestId("connection-summary")).toBeVisible();

  // F056: a baseline accessibility scan of the disconnected screen - catches broad regressions
  // (missing labels, landmark structure) on every push, not just the specific keyboard-nav fixes
  // F031 already covers. color-contrast is disabled here: several `text-muted-foreground/NN`
  // opacity variants used throughout the app for de-emphasized text fall short of WCAG AA - a real,
  // pre-existing issue, but a design-token-wide fix, not something this check should silently paper
  // over by asserting a bar the app doesn't clear yet (tracked in tech-debt-tracker.md).
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .disableRules(["color-contrast"])
    .analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});
