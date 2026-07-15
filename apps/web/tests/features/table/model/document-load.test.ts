import { describe, expect, it } from "vitest";
import { createDocumentLoadCoordinator } from "../../../../src/features/table/model/documents/document-load.js";

describe("createDocumentLoadCoordinator", () => {
  it("aborts and invalidates an older load when a new document opens", () => {
    const coordinator = createDocumentLoadCoordinator();
    const first = coordinator.begin();
    const second = coordinator.begin();

    expect(first.signal.aborted).toBe(true);
    expect(first.isCurrent()).toBe(false);
    expect(second.signal.aborted).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });

  it("aborts and invalidates the current load when the editor closes", () => {
    const coordinator = createDocumentLoadCoordinator();
    const load = coordinator.begin();

    coordinator.cancel();

    expect(load.signal.aborted).toBe(true);
    expect(load.isCurrent()).toBe(false);
  });
});
