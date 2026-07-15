import { expect, test } from "./support/test.js";

/**
 * F122: a tokenless request to any /api route must be rejected, and the real browser UI must keep
 * working end-to-end (it gets its token from the page the server itself served). Part of
 * `pnpm test:e2e` - no database required.
 */
test("@smoke a tokenless request to /api is rejected, but the UI works via its own injected token", async ({
  page,
  request
}) => {
  const tokenlessResponse = await request.get("/api/health");
  expect(tokenlessResponse.status()).toBe(401);

  const invalidTokenResponse = await request.get("/api/health", {
    headers: { authorization: "Bearer not-the-real-token" }
  });
  expect(invalidTokenResponse.status()).toBe(401);

  // The real browser page loads its token from the served HTML and authenticates transparently.
  await page.goto("/");
  await expect(page.getByTestId("status-badge")).toHaveAttribute(
    "data-status",
    /connected|disconnected|unconfigured/
  );
});
