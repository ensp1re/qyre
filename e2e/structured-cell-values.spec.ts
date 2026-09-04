import { FIXTURE, requireTestDatabaseUrl } from "@qyre/testing";
import { setupFixture } from "@qyre/testing/postgres";
import { expect, test } from "./support/test.js";

test("@full structured jsonb cell values open an inspector drawer, three levels deep", async ({
  page
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "postgres",
    "jsonb fixture column is Postgres-specific - see docs/product-specs/structured-cell-values.md"
  );
  await setupFixture(requireTestDatabaseUrl());

  await page.goto("/");
  await page.getByRole("treeitem", { name: FIXTURE.table }).click();

  const rowsTable = page.getByTestId("rows-table");
  const chip = rowsTable.getByRole("button", { name: "{ 1 key }" });
  await expect(chip).toBeVisible();
  await chip.click();

  const drawer = page.getByTestId("cell-value-drawer");
  await expect(drawer).toBeVisible();
  const accountNode = drawer.getByRole("button", { name: "account: { 1 key }" });
  await expect(accountNode).toBeVisible();

  await accountNode.click();
  const tagsNode = drawer.getByRole("button", { name: "tags: [ 2 items ]" });
  await expect(tagsNode).toBeVisible();

  await tagsNode.click();
  await expect(drawer.getByText('"admin"', { exact: true })).toBeVisible();
  await expect(drawer.getByText('"beta"', { exact: true })).toBeVisible();

  await drawer.getByRole("button", { name: "Close cell value" }).click();
  await expect(drawer).not.toBeVisible();
  await expect(chip).toBeVisible();

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

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("cell-value-drawer")).not.toBeVisible();
});
