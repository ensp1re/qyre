import type { Locator } from "@playwright/test";

/** Set an input's DOM value and press Enter before React re-renders it. */
export async function replaceInputAndPressEnterSynchronously(
  locator: Locator,
  value: string
): Promise<void> {
  await locator.evaluate((element, nextValue) => {
    if (!(element instanceof HTMLInputElement)) {
      throw new Error("Expected an input element.");
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("HTMLInputElement.value setter is unavailable.");
    setter.call(element, nextValue);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true
      })
    );
  }, value);
}
