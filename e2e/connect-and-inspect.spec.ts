import { FIXTURE, requireTestDatabaseUrl, setupFixture } from "@humbdb/testing";
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

  // DF-05: the Schema tab shows every table in the database as a card - no prior selection needed.
  await page.getByRole("tab", { name: "Schema" }).click();
  await expect(page.getByTestId("schema-grid")).toBeVisible();
  await expect(page.getByTestId("table-detail")).toBeVisible();
  await expect(page.getByTestId("table-detail").getByText("email")).toBeVisible();

  // F004: the navigation tree lists the fixture table; selecting it switches to the Tables tab.
  const navTableButton = page.getByRole("button", { name: FIXTURE.table });
  await expect(navTableButton).toBeVisible();
  await navTableButton.click();

  // F005: a page of the fixture's actual rows is visible.
  await expect(page.getByTestId("rows-table").getByText("ada@example.com")).toBeVisible();
  await expect(page.getByTestId("rows-table").getByText("grace@example.com")).toBeVisible();
});
