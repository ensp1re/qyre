import type { ConsoleEvent } from "@qyre/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConsoleLog } from "../../src/query/console-log.js";

const events: ConsoleEvent[] = [
  { id: 1, timestamp: "2026-01-01T10:00:00.000Z", level: "info", message: "connected" },
  { id: 2, timestamp: "2026-01-01T10:00:01.000Z", level: "error", message: "query failed" }
];

describe("ConsoleLog", () => {
  it("filters events by level", () => {
    render(<ConsoleLog events={events} onClear={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "error" }));
    expect(screen.getByText("query failed")).toBeVisible();
    expect(screen.queryByText("connected")).not.toBeInTheDocument();
  });

  it("clears through the labelled command", () => {
    const onClear = vi.fn();
    render(<ConsoleLog events={events} onClear={onClear} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear console" }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
