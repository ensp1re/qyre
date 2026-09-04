import type { Page } from "@playwright/test";

declare global {
  interface Window {
    __QYRE_TOKEN__?: string;
  }
}

export function readSessionToken(page: Page): Promise<string | undefined> {
  return page.evaluate(() => window.__QYRE_TOKEN__);
}
