import type { Locator } from "@playwright/test";

/**
 * Reproduces a real input/keydown race in one browser task: the DOM already contains the user's
 * final value while React has not rendered the corresponding controlled state yet.
 */
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
