import { expect, test } from "./support/test.js";
import { expectNoAccessibilityViolations } from "./support/accessibility.js";

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

  await expectNoAccessibilityViolations(page, "disconnected screen");
});
