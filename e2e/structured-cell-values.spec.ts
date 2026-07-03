import { FIXTURE, requireTestDatabaseUrl, setupFixture } from "@humbdb/testing";
import { expect, test } from "@playwright/test";

/**
 * F016: a `jsonb` cell (the fixture's `profile` column, populated only for Ada's row -
 * `{"account":{"tags":["admin","beta"]}}`) renders as an expandable summary, not a flat JSON
 * string, in both the Tables tab and a SQL Editor query result - and expanding it reveals nested
 * levels (object -> object -> array) at least three deep. Postgres-only (jsonb is a
 * Postgres-specific column type - see docs/product-specs/structured-cell-values.md) - skipped on
 * the "sqlite"/"mysql" projects, whose fixtures don't have this column.
 */
test("@full structured jsonb cell values expand inline, three levels deep", async ({
  page
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "postgres",
    "jsonb fixture column is Postgres-specific - see docs/product-specs/structured-cell-values.md"
  );
  await setupFixture(requireTestDatabaseUrl());

  await page.goto("/");
  await page.getByRole("button", { name: FIXTURE.table }).click();

  const rowsTable = page.getByTestId("rows-table");
  // Level 1: the whole cell value - { account: {...} } - one key.
  await expect(rowsTable.getByText("{ 1 key }", { exact: true })).toBeVisible();
  await rowsTable.getByText("{ 1 key }", { exact: true }).click();

  // Level 2: "account"'s value - { tags: [...] } - one key, revealed by expanding level 1.
  await expect(rowsTable.getByText("{ 1 key }", { exact: true })).toHaveCount(2);
  await rowsTable.getByText("{ 1 key }", { exact: true }).nth(1).click();

  // Level 3: "tags"'s value - a two-item array, revealed by expanding level 2.
  await expect(rowsTable.getByText("[ 2 items ]", { exact: true })).toBeVisible();
  await rowsTable.getByText("[ 2 items ]", { exact: true }).click();

  // The array's own items are plain primitive text, not a further collapsed summary.
  await expect(rowsTable.getByText("admin", { exact: true })).toBeVisible();
  await expect(rowsTable.getByText("beta", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "SQL Editor" }).click();
  const editor = page.getByTestId("query-editor").locator(".cm-content");
  await editor.fill(`SELECT * FROM ${FIXTURE.table}`);
  await page.getByRole("button", { name: "Run" }).click();

  // Same expandable rendering (not a raw JSON string) in a SQL Editor query result.
  const result = page.getByTestId("query-result");
  await expect(result.getByText("{ 1 key }", { exact: true })).toBeVisible();
});
