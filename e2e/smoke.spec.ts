import { expect, test } from "./support/test.js";
import { expectNoAccessibilityViolations } from "./support/accessibility.js";

/**
 * Smoke test: no database required. Confirms the UI boots and the connection screen renders.
 * This is part of `pnpm test:e2e` and gates CI.
 */
test("@smoke the app boots and shows the connection screen", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Qyre" })).toBeVisible();
  await expect(page.getByTestId("status-badge")).toHaveAttribute(
    "data-status",
    /connected|disconnected|unconfigured/
  );
  await expect(page.getByTestId("connection-summary")).toContainText(
    /Connected|Disconnected|No database/
  );

  // F056/F145: the disconnected screen clears WCAG A/AA, including color contrast, in both themes.
  await expectNoAccessibilityViolations(page, "disconnected screen");
});
