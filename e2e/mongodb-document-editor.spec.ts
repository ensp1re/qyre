import { FIXTURE, requireTestMongoUrl, setupMongoFixture } from "@qyre/testing";
import { expect, test } from "./support/test.js";

/**
 * F125: MongoDB's whole-document editor - edit a nested field and save, verifying the change
 * persists after the grid refetches and that the editor's relaxed-EJSON text preserves `ObjectId`
 * unambiguously (not the read-only grid's own lossy bare-hex-string display, F081). Runs on the
 * "mongodb" project only - this editing surface doesn't exist on any SQL engine.
 */
test("@full editing a MongoDB document's nested field persists and preserves ObjectId", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "mongodb", "MongoDB-specific whole-document editor.");
  await setupMongoFixture(requireTestMongoUrl());

  await page.goto("/");
  await page.getByRole("tab", { name: "Tables" }).click();
  await page.getByRole("treeitem", { name: FIXTURE.table }).click();

  const table = page.getByTestId("rows-table");
  await expect(table.getByText("Ada Lovelace")).toBeVisible();

  const adaRow = table.locator("tr", { hasText: "Ada Lovelace" });
  await adaRow.getByRole("button", { name: /edit document/i }).click();

  const drawer = page.getByTestId("document-editor-drawer");
  await expect(drawer).toBeVisible();
  const textarea = page.getByLabel("Document JSON");
  const originalText = await textarea.inputValue();

  // Real Extended JSON, not the grid's own lossy display format - ObjectId arrives wrapped, never
  // a bare hex string indistinguishable from a plain string field.
  expect(originalText).toMatch(/"\$oid"\s*:\s*"[0-9a-f]{24}"/);
  expect(originalText).toContain('"tags":["admin","beta"]');

  const updatedText = originalText.replace(
    '"tags":["admin","beta"]',
    '"tags":["admin","beta","verified"]'
  );
  await textarea.fill(updatedText);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(drawer).toHaveCount(0);

  // Persisted: reopening shows the edit, proving it round-tripped through the server, not just
  // local component state.
  await adaRow.getByRole("button", { name: /edit document/i }).click();
  await expect(page.getByLabel("Document JSON")).toHaveValue(/verified/);
});
