import { expect, test } from "@playwright/test";

test("@smoke browser storage purges credential-bearing recent targets", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "postgres", "Engine-independent storage behavior.");

  await page.addInitScript(() => {
    localStorage.setItem(
      "qyre-recent-targets",
      JSON.stringify([
        {
          raw: "postgres://example:secret@localhost/example",
          display: "postgres://example:***@localhost/example"
        },
        { raw: "./safe.sqlite", display: "./safe.sqlite" }
      ])
    );
  });
  await page.goto("/");

  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem("qyre-recent-targets") ?? "null"))
    )
    .toEqual({
      version: 1,
      value: [{ raw: "./safe.sqlite", display: "./safe.sqlite" }]
    });
});
