import {
  FIXTURE,
  requireTestDatabaseUrl,
  requireTestSqlitePath,
  setupFixture,
  setupSqliteFixture
} from "@humbdb/testing";
import { expect, test } from "@playwright/test";

/**
 * F013: the SQL Editor (CodeMirror 6) offers read-only SQL keyword completion and real table-name
 * completion after FROM/JOIN, and still runs via Ctrl/Cmd+Enter after the textarea -> CodeMirror
 * migration. Engine-agnostic - runs on both projects like query-history.spec.ts.
 */
test("@full SQL Editor autocompletes keywords and table names, and still runs via Ctrl/Cmd+Enter", async ({
  page
}, testInfo) => {
  if (testInfo.project.name === "sqlite") {
    setupSqliteFixture(requireTestSqlitePath());
  } else {
    await setupFixture(requireTestDatabaseUrl());
  }

  await page.goto("/");
  await page.getByRole("tab", { name: "SQL Editor" }).click();

  const editor = page.getByTestId("query-editor").locator(".cm-content");
  await editor.click();

  await page.keyboard.type("SE");
  await expect(page.locator(".cm-tooltip-autocomplete li", { hasText: "SELECT" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(editor).toHaveText("SELECT");

  await page.keyboard.type(` * FROM ${FIXTURE.table.slice(0, 2)}`);
  await expect(
    page.locator(".cm-tooltip-autocomplete li", { hasText: FIXTURE.table })
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(editor).toHaveText(`SELECT * FROM ${FIXTURE.table}`);

  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByTestId("query-result")).toBeVisible();
});
