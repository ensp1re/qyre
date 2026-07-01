import { FIXTURE, requireTestDatabaseUrl, setupFixture } from "@humb/testing";
import { expect, test } from "@playwright/test";

/**
 * Golden journey: connect and inspect a Postgres table end-to-end.
 *
 * Requires HUMB_TEST_DATABASE_URL. If it is missing, this test FAILS with an actionable message -
 * we never silently skip required verification (see docs/RELIABILITY.md).
 *
 * This is the verification command for features F002/F004/F005. F002/F004 are covered below; F005
 * (a page of rows) is not asserted yet - add that once F005 lands. Run it with
 * `pnpm test:e2e:golden`.
 */
test("@golden connect to Postgres and inspect a table", async ({ page }) => {
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

  // TODO(F005): assert a page of rows (e.g. the fixture's row count/emails) is visible.
});
