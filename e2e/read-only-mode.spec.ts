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
  // each one to prove it's gated rather than merely noticing the regression after the fact. F114's
  // Structure view, F116's database/schema admin UI, and F117's CSV import each added write-control
  // names, so this regex covers every wave. Deliberately excludes "switch" - switching to a sibling
  // database stays available in a read-only session (F116's "list only, affordances hidden" rule
  // means create/drop are gated, not the list/switch themselves).
  const writeControlPattern =
    /add row|new row|edit row|delete row|save changes|insert|import csv|new table|add column|edit column|drop column|create index|drop index|rename table|truncate table|drop table|new database|drop database|new schema|drop schema/i;
  await expect(page.getByRole("button", { name: writeControlPattern })).toHaveCount(0);

  // Reading still works normally - --read-only blocks writes, not reads.
  await page.getByRole("tab", { name: "Schema" }).click();
  await expect(page.getByTestId("schema-graph")).toBeVisible();
  await expect(page.locator(".react-flow__node").filter({ hasText: FIXTURE.table })).toBeVisible();
  await expect(page.getByRole("button", { name: writeControlPattern })).toHaveCount(0);

  // F114: the Structure view specifically must also render zero DDL controls - it's the surface
  // most of this test's new control names actually belong to.
  await page.getByRole("tab", { name: "Tables" }).click();
  await page.getByRole("treeitem", { name: FIXTURE.table }).click();
  await expect(page.getByRole("button", { name: writeControlPattern })).toHaveCount(0);
  await page.getByRole("button", { name: "Structure" }).click();
  await expect(page.getByTestId("table-detail")).toBeVisible();
  await expect(page.getByRole("button", { name: writeControlPattern })).toHaveCount(0);

  // F116: the connection switcher's database panel keeps the list available (not a write) while
  // hiding create/drop entirely - a stricter check than the blanket regex above, since it also
  // confirms the section itself still renders instead of merely lacking forbidden buttons.
  await page.getByRole("button", { name: "Switch database connection" }).click();
  await expect(page.getByText("Databases on this server")).toBeVisible();
  await expect(page.getByRole("button", { name: writeControlPattern })).toHaveCount(0);
});
