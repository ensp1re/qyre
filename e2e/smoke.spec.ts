import { expect, test } from "@playwright/test";

/**
 * Smoke test: no database required. Confirms the UI boots and the connection screen renders.
 * This is part of `pnpm test:e2e` and gates CI.
 */
test("@smoke the app boots and shows the connection screen", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Humb" })).toBeVisible();
  await expect(page.getByTestId("status-badge")).toBeVisible();
  await expect(page.getByTestId("connection-summary")).toBeVisible();
});
