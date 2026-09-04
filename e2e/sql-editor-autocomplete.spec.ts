import {
  FIXTURE,
  requireTestDatabaseUrl,
  requireTestMysqlUrl,
  requireTestSqlitePath,
  setupFixture,
  setupMysqlFixture,
  setupSqliteFixture
} from "@qyre/testing";
import { expect, test } from "./support/test.js";

test("@full SQL Editor autocompletes keywords, table names, and columns, and still runs via Ctrl/Cmd+Enter", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name === "mongodb", "MongoDB has no SQL Editor.");
  if (testInfo.project.name === "sqlite") {
    setupSqliteFixture(requireTestSqlitePath());
  } else if (testInfo.project.name === "mysql") {
    await setupMysqlFixture(requireTestMysqlUrl());
  } else {
    await setupFixture(requireTestDatabaseUrl());
  }

  // Wait for completion metadata before typing.
  const tablesReady = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/tables" && response.ok()
  );
  await page.goto("/");
  await tablesReady;
  await page.getByRole("tab", { name: "SQL Editor" }).click();

  const editor = page.getByTestId("query-editor").locator(".cm-content");
  await editor.click();

  await page.keyboard.type("SE");
  const selectCompletion = page.locator(".cm-tooltip-autocomplete li", { hasText: "SELECT" });
  await expect(selectCompletion).toBeVisible();
  await selectCompletion.click();
  await expect(editor).toHaveText("SELECT");

  await page.keyboard.type(` * FROM ${FIXTURE.table.slice(0, 2)}`);
  const tableCompletion = page.locator(".cm-tooltip-autocomplete li", {
    hasText: FIXTURE.table
  });
  await expect(tableCompletion).toBeVisible();
  await tableCompletion.click();
  await expect(editor).toHaveText(`SELECT * FROM ${FIXTURE.table}`);

  await page.keyboard.type(` WHERE ${FIXTURE.table}.em`);
  const columnCompletion = page.locator(".cm-tooltip-autocomplete li", { hasText: "email" });
  await expect(columnCompletion).toBeVisible();
  await columnCompletion.click();
  await expect(editor).toHaveText(`SELECT * FROM ${FIXTURE.table} WHERE ${FIXTURE.table}.email`);

  await page.keyboard.type(" = 'ada@example.com'");
  await expect(editor).toHaveText(
    `SELECT * FROM ${FIXTURE.table} WHERE ${FIXTURE.table}.email = 'ada@example.com'`
  );

  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByTestId("query-result")).toBeVisible();
});
