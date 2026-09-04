import { FIXTURE, requireTestDatabaseUrl, runStatements, setupFixture } from "@qyre/testing";
import { expect, test } from "./support/test.js";

test("@full a write-capable session runs a mutation directly and confirms a destructive statement", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "postgres", "One representative SQL engine is enough here.");
  const databaseUrl = requireTestDatabaseUrl();
  await setupFixture(databaseUrl);
  await runStatements(databaseUrl, ["DROP TABLE IF EXISTS qyre_e2e_write_scratch"]);

  await page.goto("/");
  await page.getByRole("tab", { name: "SQL Editor" }).click();

  const editor = page.getByTestId("query-editor").locator(".cm-content");

  await editor.click();
  await editor.fill(`SELECT * FROM ${FIXTURE.table} WHERE name = 'Ada Lovelace'`);
  await expect(page.getByRole("checkbox", { name: "Run with EXPLAIN ANALYZE" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Explain" })).toHaveCount(0);

  await editor.click();
  await editor.fill(
    `UPDATE ${FIXTURE.table} SET name = 'Ada Lovelace' WHERE name = 'Ada Lovelace'`
  );
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByTestId("query-result")).toContainText("1 row affected.");

  await page.getByRole("button", { name: "Query history" }).click();
  const historyCard = page.getByTestId("query-history-card").first();
  await expect(historyCard.getByTestId("query-history-classification")).toHaveText("mutation");
  await page.getByRole("button", { name: "Close history" }).click();

  await editor.click();
  await editor.fill("CREATE TABLE qyre_e2e_write_scratch (id serial PRIMARY KEY, note text)");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByTestId("query-result")).toContainText("rows affected.");
  await expect(page.getByTestId("confirm-destructive-statement-dialog")).toHaveCount(0);
  await expect(page.getByRole("treeitem", { name: "qyre_e2e_write_scratch" })).toBeVisible();

  await editor.click();
  await editor.fill("INSERT INTO qyre_e2e_write_scratch (note) VALUES ('x')");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByTestId("query-result")).toContainText("1 row affected.");

  await editor.click();
  await editor.fill("DELETE FROM qyre_e2e_write_scratch");
  await page.getByRole("button", { name: "Run" }).click();
  const dialog = page.getByTestId("confirm-destructive-statement-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("statement-classification")).toHaveText("destructive");
  await expect(dialog).toContainText("DELETE FROM qyre_e2e_write_scratch");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByTestId("confirm-destructive-statement-dialog")).toBeVisible();
  await page.getByRole("button", { name: "Run anyway" }).click();
  await expect(page.getByTestId("confirm-destructive-statement-dialog")).toHaveCount(0);
  await expect(page.getByTestId("query-result")).toContainText("1 row affected.");

  await runStatements(databaseUrl, ["DROP TABLE IF EXISTS qyre_e2e_write_scratch"]);
});
