import { FIXTURE, requireTestDatabaseUrl, setupFixture } from "@qyre/testing";
import { expect, test } from "@playwright/test";

/**
 * F096/F097 regression guard: a session forced read-only via `--read-only` renders the read-only
 * access badge and zero write affordances, even though the underlying Postgres fixture role is
 * fully writable (see playwright.config.ts's "readonly" project - same fixture as "postgres", just
 * launched with the flag forced). This is the standing guard every later write slice (F099+) must
 * keep green: any new write control must check `sessionAllows`/`tableAllows`
 * (features/connection/model/capability-gates.ts) before rendering, or this test starts failing the
 * moment it appears unconditionally.
 *
 * Runs only on the "readonly" project - every other project already covers the connected/writable
 * read path.
 */
test("@full a --read-only session shows the read-only badge and renders zero write affordances", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "readonly", "Read-only-mode-specific behavior.");
  await setupFixture(requireTestDatabaseUrl());

  await page.goto("/");
  await expect(page.getByTestId("status-badge")).toHaveAttribute("data-status", "connected");

  const badge = page.getByTestId("access-badge");
  await expect(badge).toHaveAttribute("data-access", "read-only");
  await expect(badge).toHaveAttribute("title", "Read-only: qyre --read-only flag");

  // No write-affording control exists anywhere in the app yet (Qyre is read-only pre-F099) - this
  // canary keeps that true specifically *in a read-only session* as write features land, forcing
  // each one to prove it's gated rather than merely noticing the regression after the fact.
  await expect(
    page.getByRole("button", { name: /add row|new row|edit row|delete row|save changes|insert/i })
  ).toHaveCount(0);

  // Reading still works normally - --read-only blocks writes, not reads.
  await page.getByRole("tab", { name: "Schema" }).click();
  await expect(page.getByTestId("schema-graph")).toBeVisible();
  await expect(page.locator(".react-flow__node").filter({ hasText: FIXTURE.table })).toBeVisible();
});
