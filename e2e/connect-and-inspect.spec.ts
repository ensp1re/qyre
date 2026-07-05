import AxeBuilder from "@axe-core/playwright";
import {
  FIXTURE,
  requireTestDatabaseUrl,
  requireTestMysqlUrl,
  requireTestSqlitePath,
  setupFixture,
  setupMysqlFixture,
  setupSqliteFixture
} from "@humbdb/testing";
import { expect, test } from "@playwright/test";

/**
 * Full end-to-end journey: connect and inspect a table. Runs once per engine project (see
 * playwright.config.ts) against the same fixture shape (table/columns/rows), so this proves the UI
 * is genuinely engine-agnostic rather than accidentally Postgres-shaped - see
 * docs/product-specs/connect-and-inspect-sqlite.md's "same spec, parameterized by engine/fixture"
 * requirement (F011).
 *
 * The "postgres" project requires HUMB_TEST_DATABASE_URL and the "mysql" project requires
 * HUMB_TEST_MYSQL_URL; if either is missing, this test FAILS with an actionable message - we never
 * silently skip required verification (see docs/RELIABILITY.md). The "sqlite" project is
 * self-contained (no setup required).
 *
 * This is the verification command for features F002/F004/F005/F011/F014, all covered below. Run
 * it with `pnpm test:e2e:full`.
 */
test("@full connect and inspect a table", async ({ page }, testInfo) => {
  if (testInfo.project.name === "sqlite") {
    setupSqliteFixture(requireTestSqlitePath());
  } else if (testInfo.project.name === "mysql") {
    await setupMysqlFixture(requireTestMysqlUrl());
  } else {
    await setupFixture(requireTestDatabaseUrl());
  }

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
  // Tree rows are role="treeitem", not "button" (F031's accessibility fix).
  const navTableButton = page.getByRole("treeitem", { name: FIXTURE.table });
  await expect(navTableButton).toBeVisible();
  await navTableButton.click();

  // F005: a page of the fixture's actual rows is visible.
  await expect(page.getByTestId("rows-table").getByText("ada@example.com")).toBeVisible();
  await expect(page.getByTestId("rows-table").getByText("grace@example.com")).toBeVisible();

  // F056: a baseline accessibility scan of the fully-loaded, data-rich state (sidebar tree, Schema
  // grid, Tables tab) - a broader surface than smoke.spec.ts's disconnected-screen scan.
  // color-contrast is disabled - see smoke.spec.ts's comment for why.
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .disableRules(["color-contrast"])
    .analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});
