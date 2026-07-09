import AxeBuilder from "@axe-core/playwright";
import {
  FIXTURE,
  requireTestDatabaseUrl,
  requireTestMongoUrl,
  requireTestMysqlUrl,
  requireTestSqlitePath,
  setupFixture,
  setupMongoFixture,
  setupMysqlFixture,
  setupSqliteFixture
} from "@qyre/testing";
import { expect, test } from "@playwright/test";

/**
 * Full end-to-end journey: connect and inspect a table. Runs once per engine project (see
 * playwright.config.ts) against the same fixture shape (table/columns/rows), so this proves the UI
 * is genuinely engine-agnostic rather than accidentally Postgres-shaped - see
 * docs/product-specs/connect-and-inspect-sqlite.md's "same spec, parameterized by engine/fixture"
 * requirement (F011).
 *
 * The "postgres" project requires QYRE_TEST_DATABASE_URL and the "mysql" project requires
 * QYRE_TEST_MYSQL_URL; if either is missing, this test FAILS with an actionable message - we never
 * silently skip required verification (see docs/RELIABILITY.md). The "sqlite" project is
 * self-contained (no setup required).
 *
 * This is the verification command for features F002/F004/F005/F011/F014, all covered below. Run
 * it with `pnpm test:e2e:full`.
 */
test("@full connect and inspect a table", async ({ page }, testInfo) => {
  if (testInfo.project.name === "sqlite") {
    setupSqliteFixture(requireTestSqlitePath());
  } else if (testInfo.project.name === "mongodb") {
    await setupMongoFixture(requireTestMongoUrl());
  } else if (testInfo.project.name === "mysql") {
    await setupMysqlFixture(requireTestMysqlUrl());
  } else {
    await setupFixture(requireTestDatabaseUrl());
  }

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Qyre" })).toBeVisible();

  // F002: the UI reports the database is connected.
  await expect(page.getByTestId("status-badge")).toHaveAttribute("data-status", "connected");

  if (testInfo.project.name === "mongodb") {
    await expect(page.getByRole("tab", { name: "SQL Editor" })).toBeDisabled();
    await expect(page.getByText(/SQL Editor is not available for MongoDB/)).toBeVisible();
  }

  // F074: the Schema tab defaults to the interactive ERD graph - every table a node, no prior
  // selection needed.
  await page.getByRole("tab", { name: "Schema" }).click();
  await expect(page.getByTestId("schema-graph")).toBeVisible();
  await expect(page.locator(".react-flow__node").first()).toBeVisible();

  // F074: the Grid toggle switches to the DF-05 card view, which still lists every table's columns.
  // Scoped to the fixture's own card (by name) rather than "the" table-detail card - the target
  // database may hold other tables besides the fixture (e.g. a developer's own data alongside it),
  // and asserting on an unscoped `table-detail` locator broke under Playwright's strict mode as
  // soon as more than one table existed.
  await page.getByRole("button", { name: "Grid" }).click();
  await expect(page.getByTestId("schema-grid")).toBeVisible();
  const fixtureCard = page.getByTestId("table-detail").filter({ hasText: FIXTURE.table });
  await expect(fixtureCard).toBeVisible();
  await expect(fixtureCard.getByText("email")).toBeVisible();

  // F004: the navigation tree lists the fixture table; selecting it switches to the Tables tab.
  // Tree rows are role="treeitem", not "button" (F031's accessibility fix).
  const navTableButton = page.getByRole("treeitem", { name: FIXTURE.table });
  await expect(navTableButton).toBeVisible();
  await navTableButton.click();

  // F005: a page of the fixture's actual rows is visible.
  await expect(page.getByTestId("rows-table").getByText("ada@example.com")).toBeVisible();
  await expect(page.getByTestId("rows-table").getByText("grace@example.com")).toBeVisible();

  if (testInfo.project.name === "mongodb") {
    await page.getByTestId("rows-table").getByRole("button", { name: "{ 1 key }" }).click();
    await expect(
      page.getByTestId("cell-value-drawer").getByRole("button", { name: "account: { 1 key }" })
    ).toBeVisible();
    await page.getByRole("button", { name: "Close cell value" }).click();
  }

  // F056: a baseline accessibility scan of the fully-loaded, data-rich state (sidebar tree, Schema
  // grid, Tables tab) - a broader surface than smoke.spec.ts's disconnected-screen scan.
  // color-contrast is disabled - see smoke.spec.ts's comment for why.
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .disableRules(["color-contrast"])
    .analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});
