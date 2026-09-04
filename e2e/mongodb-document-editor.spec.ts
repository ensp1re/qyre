import { FIXTURE, requireTestMongoUrl } from "@qyre/testing";
import { setupMongoFixture } from "@qyre/testing/mongodb";
import { expect, test } from "./support/test.js";

test("@full MongoDB uses the shared typed grid for edit, insert, and delete", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "mongodb", "MongoDB-specific mutation roundtrip.");
  await setupMongoFixture(requireTestMongoUrl());

  await page.goto("/");
  await page.getByRole("tab", { name: "Tables" }).click();
  await page.getByRole("treeitem", { name: FIXTURE.table }).click();

  const table = page.getByTestId("rows-table");
  await expect(table.getByText("Ada Lovelace")).toBeVisible();
  await expect(page.getByRole("button", { name: "Insert document" })).toHaveCount(0);

  const nameCell = table.getByRole("button", { name: "Ada Lovelace" });
  await nameCell.click();
  await nameCell.press("Enter");
  const nameEditor = table.getByRole("textbox", { name: "name", exact: true });
  await nameEditor.fill("Ada Byron");
  await nameEditor.press("ControlOrMeta+Enter");

  await table.getByRole("button", { name: "Edit profile" }).click();
  const profileEditor = page.getByRole("textbox", { name: "JSON editor" });
  await profileEditor.fill('{"account":{"tags":["admin","beta","verified"]}}');
  await page.getByRole("button", { name: "Apply" }).click();

  await page.getByRole("button", { name: "Add row" }).click();
  await page.getByRole("button", { name: "Set name" }).click();
  const insertedName = page.getByRole("textbox", { name: "name", exact: true });
  await insertedName.fill("Marie Curie");
  await insertedName.press("ControlOrMeta+Enter");

  await page.getByLabel("Select row 2").check();
  await page.getByRole("button", { name: "Delete 1 selected" }).click();

  const summary = page.getByText("1 to insert, 1 to update, 1 to delete");
  await expect(summary).toBeVisible();
  await page.getByRole("button", { name: "Commit", exact: true }).click();

  await expect(summary).not.toBeVisible();
  await expect(table.getByText("Ada Byron")).toBeVisible();
  await expect(table.getByText("Marie Curie")).toBeVisible();
  await expect(table.getByText("Alan Turing")).not.toBeVisible();

  await table.getByRole("button", { name: "Edit profile" }).click();
  await expect(page.getByRole("textbox", { name: "JSON editor" })).toHaveValue(/verified/);
});
