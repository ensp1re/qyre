import { parseConnectionTarget } from "@qyre/core";
import { resolveAdapter } from "@qyre/driver-contract";
import { mongodbAdapterFactory } from "@qyre/mongodb";
import { mysqlAdapterFactory } from "@qyre/mysql";
import { postgresAdapterFactory } from "@qyre/postgres";
import { startServer } from "@qyre/server";
import { sqliteAdapterFactory } from "@qyre/sqlite";
import {
  FIXTURE,
  requireTestDatabaseUrl,
  requireTestMongoUrl,
  requireTestMysqlUrl,
  requireTestSqlitePath,
  runStatements,
  setupFixture,
  setupMongoFixture,
  setupMysqlFixture,
  setupSqliteFixture
} from "@qyre/testing";
import { expect, test } from "./support/test.js";
import { expectNoAccessibilityViolations } from "./support/accessibility.js";
import { replaceInputAndPressEnterSynchronously } from "./support/live-input.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/web/dist");

async function setupProjectFixture(projectName: string): Promise<void> {
  if (projectName === "sqlite") {
    setupSqliteFixture(requireTestSqlitePath());
  } else if (projectName === "mongodb") {
    await setupMongoFixture(requireTestMongoUrl());
  } else if (projectName === "mysql") {
    await setupMysqlFixture(requireTestMysqlUrl());
  } else {
    await setupFixture(requireTestDatabaseUrl());
  }
}

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
  await setupProjectFixture(testInfo.project.name);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Qyre" })).toBeVisible();

  // F002: the UI reports the database is connected.
  await expect(page.getByTestId("status-badge")).toHaveAttribute("data-status", "connected");

  if (testInfo.project.name === "mongodb") {
    await expect(page.getByRole("tab", { name: "SQL Editor" })).toHaveCount(0);
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

  // F056/F145: the connected data-rich state clears WCAG A/AA in both supported themes.
  await expectNoAccessibilityViolations(page, "connected database screen");
});

test("@full filter composition handles immediate Enter and restores Escape focus", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "postgres", "One shared-UI browser proof is sufficient.");
  await setupProjectFixture(testInfo.project.name);

  await page.goto("/");
  await page.getByRole("tab", { name: "Tables" }).click();
  await page.getByRole("treeitem", { name: FIXTURE.table }).click();

  await page.getByRole("button", { name: "Add filter" }).click();
  const search = page.getByRole("combobox", { name: "Search columns" });
  await replaceInputAndPressEnterSynchronously(search, "name");

  const contains = page.getByRole("option", { name: /contains/ });
  await expect(contains).toBeVisible();
  await contains.press("Enter");

  const value = page.getByRole("textbox", { name: "Filter value" });
  await replaceInputAndPressEnterSynchronously(value, "Ada");
  await expect(page.getByRole("dialog", { name: "Add filter" })).not.toBeVisible();
  await expect(page.getByTestId("rows-table").getByText("Ada Lovelace")).toBeVisible();
  await expect(page.getByTestId("rows-table").getByText("Grace Hopper")).not.toBeVisible();

  await page.getByRole("button", { name: "Add filter" }).click();
  const nextSearch = page.getByRole("combobox", { name: "Search columns" });
  await nextSearch.fill("name");
  await nextSearch.press("Enter");
  await page.getByRole("option", { name: /contains/ }).press("Escape");
  await expect(page.getByRole("combobox", { name: "Search columns" })).toBeFocused();
  await page.getByRole("combobox", { name: "Search columns" }).press("Escape");
  await expect(page.getByRole("dialog", { name: "Add filter" })).not.toBeVisible();
});

test.describe("cross-engine connection switching", () => {
  test.use({ fixtureEngines: ["mongodb", "postgres"] });

  test("@full switching to MongoDB refreshes the shell without a reload", async ({
    page
  }, testInfo) => {
    test.skip(testInfo.project.name !== "postgres", "Run the cross-engine switch once.");

    const postgresUrl = requireTestDatabaseUrl();
    await setupFixture(postgresUrl);
    await runStatements(postgresUrl, [
      "DROP TABLE IF EXISTS qyre_switch_only_postgres",
      "CREATE TABLE qyre_switch_only_postgres (id serial PRIMARY KEY, label text NOT NULL)"
    ]);

    const mongoUrl = requireTestMongoUrl();
    await setupMongoFixture(mongoUrl);

    const target = parseConnectionTarget(postgresUrl);
    const adapter = resolveAdapter([postgresAdapterFactory], target);
    await adapter.connect();
    const server = await startServer({
      adapter,
      target,
      port: 4191,
      host: "127.0.0.1",
      webRoot: WEB_ROOT,
      logger: false,
      adapterFactories: [
        postgresAdapterFactory,
        sqliteAdapterFactory,
        mysqlAdapterFactory,
        mongodbAdapterFactory
      ]
    });
    try {
      await page.goto(server.url);
      await expect(page.getByRole("treeitem", { name: "qyre_switch_only_postgres" })).toBeVisible();

      await page.getByRole("button", { name: "Switch database connection" }).click();
      await page.getByPlaceholder("postgres://user:pass@host:5432/db").fill(mongoUrl);
      await page.getByRole("button", { name: "Connect", exact: true }).click();

      await expect(page.getByRole("tab", { name: "SQL Editor" })).toHaveCount(0);
      await expect(page.getByRole("treeitem", { name: FIXTURE.table })).toBeVisible();
      await expect(page.getByRole("treeitem", { name: "qyre_switch_only_postgres" })).toHaveCount(
        0
      );
    } finally {
      await server.close();
    }
  });
});
