import { FIXTURE, requireTestDatabaseUrl, setupFixture } from "@humb/testing";
import { expect, test } from "@playwright/test";

/**
 * Full end-to-end journey: connect and inspect a Postgres table.
 *
 * Requires HUMB_TEST_DATABASE_URL. If it is missing, this test FAILS with an actionable message -
 * we never silently skip required verification (see docs/RELIABILITY.md).
 *
 * This is the verification command for features F002/F004/F005, all covered below. Run it with
 * `pnpm test:e2e:full`.
 */
test("@full connect to Postgres and inspect a table", async ({ page }) => {
  const databaseUrl = requireTestDatabaseUrl();
  await setupFixture(databaseUrl);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Humb" })).toBeVisible();

  // F002: the UI reports the database is connected.
  await expect(page.getByTestId("status-badge")).toHaveAttribute("data-status", "connected");

  // F004: the navigation tree lists the fixture table; selecting it shows its columns.
  await expect(page.getByText(FIXTURE.table)).toBeVisible();
  await page.getByRole("button", { name: FIXTURE.table }).click();
  await expect(page.getByTestId("table-detail")).toBeVisible();
  await expect(page.getByTestId("table-detail").getByText("email")).toBeVisible();

  // F005: a page of the fixture's actual rows is visible.
  await expect(page.getByTestId("rows-table").getByText("ada@example.com")).toBeVisible();
  await expect(page.getByTestId("rows-table").getByText("grace@example.com")).toBeVisible();
});
