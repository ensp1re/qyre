import {
  FIXTURE,
  requireTestDatabaseUrl,
  requireTestMysqlUrl,
  requireTestSqlitePath,
  setupFixture,
  setupMysqlFixture,
  setupSqliteFixture
} from "@qyre/testing";
import { expect, test } from "@playwright/test";

/**
 * F012: a successful SQL Editor query is recorded in history; selecting a history card prefills
 * the editor without running it. Engine-agnostic UI/localStorage behavior - runs on every project
 * (see playwright.config.ts) not because it differs per engine, but to match this repo's existing
 * per-spec convention (smoke.spec.ts also runs on all of them).
 */
test("@full SQL Editor records a successful query and prefills it from history", async ({
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

  await page.goto("/");
  await page.getByRole("tab", { name: "SQL Editor" }).click();

  const sql = `SELECT * FROM ${FIXTURE.table}`;
  const editor = page.getByTestId("query-editor").locator(".cm-content");
  await editor.fill(sql);
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByTestId("query-result")).toBeVisible();

  await page.getByRole("button", { name: "Query history" }).click();
  const card = page.getByTestId("query-history-card").first();
  await expect(card).toContainText(sql);

  // Clear the editor first so the next assertion actually proves the click prefilled it, rather
  // than the text already being there from the Run above.
  await editor.fill("");
  await card.click();

  await expect(editor).toHaveText(sql);
  // The drawer is always mounted (position: fixed, slid off-screen via a transform when closed) -
  // Playwright's toBeVisible() doesn't detect that as hidden since the element still has a real
  // bounding box, so assert the actual closed-state class instead.
  await expect(page.getByTestId("query-history-drawer")).toHaveClass(/translate-x-full/);
});
