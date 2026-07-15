import { FIXTURE, requireTestDatabaseUrl, runStatements, setupFixture } from "@qyre/testing";
import { expect, test } from "./support/test.js";

/**
 * F108: the SQL Editor becomes write-capable when the session allows. Runs on Postgres only -
 * F107's own adapter/route-layer tests already cover cross-engine parity; this is a UI roundtrip
 * proof, matching row-editing-commit.spec.ts's "one representative SQL engine is enough here".
 * The destructive-statement assertions use a scratch table, not the shared fixture, so an
 * unqualified DELETE here can never race a concurrently-running spec that expects the fixture's
 * own rows to still be present.
 */
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

  // A native query plan renders in its own output panel. ANALYZE stays an explicit opt-in because
  // PostgreSQL executes the target query when it is enabled.
  await editor.click();
  await editor.fill(`SELECT * FROM ${FIXTURE.table} WHERE name = 'Ada Lovelace'`);
  await page.getByRole("button", { name: "Explain" }).click();
  await expect(page.getByTestId("query-plan")).toContainText(/Scan on/);

  await page.getByRole("checkbox", { name: "Run with EXPLAIN ANALYZE" }).check();
  await expect(page.getByRole("alert")).toContainText("executes the statement");
  await page.getByRole("button", { name: "Explain" }).click();
  await expect(page.getByTestId("query-plan")).toContainText("analyzed");

  // A mutation with a WHERE clause runs directly (no confirmation) and reports affected rows.
  await editor.click();
  await editor.fill(
    `UPDATE ${FIXTURE.table} SET name = 'Ada Lovelace' WHERE name = 'Ada Lovelace'`
  );
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByTestId("query-result")).toContainText("1 row affected.");

  // The classification is recorded in query history.
  await page.getByRole("button", { name: "Query history" }).click();
  const historyCard = page.getByTestId("query-history-card").first();
  await expect(historyCard.getByTestId("query-history-classification")).toHaveText("mutation");
  await page.getByRole("button", { name: "Close history" }).click();

  // A ddl statement runs directly too - no confirmation dialog.
  await editor.click();
  await editor.fill("CREATE TABLE qyre_e2e_write_scratch (id serial PRIMARY KEY, note text)");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByTestId("query-result")).toContainText("rows affected.");
  await expect(page.getByTestId("confirm-destructive-statement-dialog")).toHaveCount(0);

  await editor.click();
  await editor.fill("INSERT INTO qyre_e2e_write_scratch (note) VALUES ('x')");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByTestId("query-result")).toContainText("1 row affected.");

  // An unqualified DELETE (no WHERE) is destructive - opens the confirmation dialog instead of
  // running immediately. Cancel first to prove nothing ran.
  await editor.click();
  await editor.fill("DELETE FROM qyre_e2e_write_scratch");
  await page.getByRole("button", { name: "Run" }).click();
  const dialog = page.getByTestId("confirm-destructive-statement-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("statement-classification")).toHaveText("destructive");
  await expect(dialog).toContainText("DELETE FROM qyre_e2e_write_scratch");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);

  // Confirming re-runs the exact same statement with confirmed: true.
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByTestId("confirm-destructive-statement-dialog")).toBeVisible();
  await page.getByRole("button", { name: "Run anyway" }).click();
  await expect(page.getByTestId("confirm-destructive-statement-dialog")).toHaveCount(0);
  await expect(page.getByTestId("query-result")).toContainText("1 row affected.");

  await runStatements(databaseUrl, ["DROP TABLE IF EXISTS qyre_e2e_write_scratch"]);
});
