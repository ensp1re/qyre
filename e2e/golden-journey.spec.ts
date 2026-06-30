import { FIXTURE, requireTestDatabaseUrl, setupFixture } from "@humb/testing";
import { expect, test } from "@playwright/test";

/**
 * Golden journey: connect and inspect a Postgres table end-to-end.
 *
 * Requires HUMB_TEST_DATABASE_URL. If it is missing, this test FAILS with an actionable message -
 * we never silently skip required verification (see docs/RELIABILITY.md).
 *
 * This is the verification command for features F002/F004/F005. It is expected to be RED until those
 * features are implemented (the UI cannot yet browse tables). Run it with `pnpm test:e2e:golden`.
 */
test("@golden connect to Postgres and inspect a table", async ({ page }) => {
  const databaseUrl = requireTestDatabaseUrl();
  await setupFixture(databaseUrl);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Humb" })).toBeVisible();

  // The following steps depend on features F002/F004/F005 (UI navigation tree + table view).
  // Implement them to turn this journey green:
  //   1. Launch Humb against `databaseUrl` so the UI reports "connected".
  //   2. Open the `${FIXTURE.schema}.${FIXTURE.table}` table from the navigation tree.
  //   3. Assert its columns and a page of rows are visible.
  await expect(page.getByTestId("status-badge")).toHaveAttribute("data-status", "connected");
  await expect(page.getByText(FIXTURE.table)).toBeVisible();
});
