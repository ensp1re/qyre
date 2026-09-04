import { FIXTURE } from "@qyre/testing";
import { expect, test } from "./support/test.js";
import { setupProjectFixture } from "./support/fixture-setup.js";

test("@full SQL Editor records a successful query and prefills it from history", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name === "mongodb", "MongoDB has no SQL Editor.");
  await setupProjectFixture(testInfo.project.name);

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

  await editor.fill("");
  await card.click();

  await expect(editor).toHaveText(sql);
  // The drawer remains mounted offscreen, so assert its closed-state class.
  await expect(page.getByTestId("query-history-drawer")).toHaveClass(/translate-x-full/);
});
