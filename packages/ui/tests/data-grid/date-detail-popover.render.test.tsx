import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DateDetailPopover,
  formatRelativeTime
} from "../../src/data-grid/cells/date-detail-popover.js";

const ANCHOR = { left: 100, right: 200, bottom: 50 } as DOMRect;

describe("formatRelativeTime", () => {
  it("formats past and future differences at the coarsest readable unit", () => {
    const now = new Date("2024-06-15T12:00:00.000Z");
    expect(formatRelativeTime(new Date("2024-06-15T11:59:30.000Z"), now)).toBe("30 seconds ago");
    expect(formatRelativeTime(new Date("2024-06-15T13:00:00.000Z"), now)).toBe("in 1 hour");
    expect(formatRelativeTime(new Date("2024-06-12T12:00:00.000Z"), now)).toBe("3 days ago");
  });
});

describe("DateDetailPopover", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn() } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the raw value, UTC ISO string, and epoch for a valid date", () => {
    render(
      <DateDetailPopover value="2024-01-15 10:30:00+00" anchorRect={ANCHOR} onClose={vi.fn()} />
    );
    expect(screen.getByText("2024-01-15 10:30:00+00")).toBeInTheDocument();
    expect(screen.getByText("2024-01-15T10:30:00.000Z")).toBeInTheDocument();
    expect(screen.getByText(/1705314600s/)).toBeInTheDocument();
  });

  it("shows a graceful fallback for a value that isn't a parseable date", () => {
    render(<DateDetailPopover value="not-a-date" anchorRect={ANCHOR} onClose={vi.fn()} />);
    expect(screen.getByText(/Could not parse/)).toBeInTheDocument();
  });

  it("closes on Escape and on clicking the backdrop", () => {
    const onClose = vi.fn();
    render(
      <DateDetailPopover value="2024-01-15T10:30:00.000Z" anchorRect={ANCHOR} onClose={onClose} />
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("Close date detail"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("copies a row's text via the clipboard when its copy button is clicked", () => {
    render(
      <DateDetailPopover value="2024-01-15T10:30:00.000Z" anchorRect={ANCHOR} onClose={vi.fn()} />
    );
    fireEvent.click(screen.getByLabelText("Copy UTC"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("2024-01-15T10:30:00.000Z");
  });
});

describe("DateDetailPopover for zone-less values", () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/Los_Angeles";
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it("shows a DATE as written instead of shifting it through UTC midnight", () => {
    render(<DateDetailPopover value="2024-05-01" anchorRect={ANCHOR} onClose={vi.fn()} />);
    expect(screen.getByText("2024-05-01")).toBeInTheDocument();
    expect(screen.getByText(/no time zone/i)).toBeInTheDocument();
    expect(screen.queryByText(/Apr 30/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Copy UTC")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Copy Unix epoch")).not.toBeInTheDocument();
  });

  it("does not claim a UTC instant or epoch for a timestamp without a zone", () => {
    render(
      <DateDetailPopover value="2024-05-01 23:30:00.123" anchorRect={ANCHOR} onClose={vi.fn()} />
    );
    expect(screen.getByText("2024-05-01 23:30:00.123")).toBeInTheDocument();
    expect(screen.queryByLabelText("Copy UTC")).not.toBeInTheDocument();
    expect(screen.queryByText(/2024-05-02T/)).not.toBeInTheDocument();
  });

  it("still converts a timestamp that carries an explicit offset", () => {
    render(
      <DateDetailPopover value="2024-05-01T23:30:00-07:00" anchorRect={ANCHOR} onClose={vi.fn()} />
    );
    expect(screen.getByText("2024-05-02T06:30:00.000Z")).toBeInTheDocument();
  });
});
