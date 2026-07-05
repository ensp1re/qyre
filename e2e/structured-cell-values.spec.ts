import { FIXTURE, requireTestDatabaseUrl, setupFixture } from "@qyre/testing";
import { expect, test } from "@playwright/test";

/**
 * F016: a `jsonb` cell (the fixture's `profile` column, populated only for Ada's row -
 * `{"account":{"tags":["admin","beta"]}}`) renders as a compact summary chip, not a flat JSON
 * string, in both the Tables tab and a SQL Editor query result. Clicking the chip opens the
 * cell-value inspector drawer, whose tree expands through nested levels (object -> object ->
 * array, three deep) without falling back to flat text. Postgres-only (jsonb is a
 * Postgres-specific column type - see docs/product-specs/structured-cell-values.md) - skipped on
 * the "sqlite"/"mysql" projects, whose fixtures don't have this column.
 */
test("@full structured jsonb cell values open an inspector drawer, three levels deep", async ({
  page
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "postgres",
    "jsonb fixture column is Postgres-specific - see docs/product-specs/structured-cell-values.md"
  );
  await setupFixture(requireTestDatabaseUrl());

  await page.goto("/");
  // Tree rows are role="treeitem", not "button" (F031's accessibility fix).
  await page.getByRole("treeitem", { name: FIXTURE.table }).click();

  // Level 1 (in the table): the cell is a compact chip, not a raw JSON string.
  const rowsTable = page.getByTestId("rows-table");
  const chip = rowsTable.getByRole("button", { name: "{ 1 key }" });
  await expect(chip).toBeVisible();
  await chip.click();

  // The drawer opens with the root level expanded: "account" is visible, still collapsed.
  const drawer = page.getByTestId("cell-value-drawer");
  await expect(drawer).toBeVisible();
  const accountNode = drawer.getByRole("button", { name: "account: { 1 key }" });
  await expect(accountNode).toBeVisible();

  // Level 2: expanding "account" reveals "tags", a collapsed two-item array.
  await accountNode.click();
  const tagsNode = drawer.getByRole("button", { name: "tags: [ 2 items ]" });
  await expect(tagsNode).toBeVisible();

  // Level 3: expanding "tags" reveals the primitive array items, quoted as JSON strings.
  await tagsNode.click();
  await expect(drawer.getByText('"admin"', { exact: true })).toBeVisible();
  await expect(drawer.getByText('"beta"', { exact: true })).toBeVisible();

  // Closing the drawer returns to the untouched table.
  await drawer.getByRole("button", { name: "Close cell value" }).click();
  await expect(drawer).not.toBeVisible();
  await expect(chip).toBeVisible();

  // Same chip + drawer behavior in a SQL Editor query result.
  await page.getByRole("tab", { name: "SQL Editor" }).click();
  const editor = page.getByTestId("query-editor").locator(".cm-content");
  await editor.fill(`SELECT * FROM ${FIXTURE.table}`);
  await page.getByRole("button", { name: "Run" }).click();

  const result = page.getByTestId("query-result");
  await result.getByRole("button", { name: "{ 1 key }" }).click();
  await expect(page.getByTestId("cell-value-drawer")).toBeVisible();
  await expect(
    page.getByTestId("cell-value-drawer").getByRole("button", { name: "account: { 1 key }" })
  ).toBeVisible();

  // Esc also closes the drawer.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("cell-value-drawer")).not.toBeVisible();
});
