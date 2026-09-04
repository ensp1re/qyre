import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DateTimeInput } from "../../src/primitives/date-time-input.js";

/** Controlled wrapper that feeds each change back as the next value prop. */
function Controlled({
  kind,
  initial
}: {
  kind: "date" | "time" | "datetime-local";
  initial: string;
}): ReactNode {
  const [value, setValue] = useState(initial);
  return <DateTimeInput kind={kind} value={value} onChange={setValue} />;
}

describe("DateTimeInput (date)", () => {
  it("shows a placeholder until a day is picked, then commits YYYY-MM-DD", () => {
    const onChange = vi.fn();
    render(<DateTimeInput kind="date" value="" onChange={onChange} />);

    expect(screen.getByRole("button", { name: "Choose date" })).toHaveTextContent("Select date");

    fireEvent.click(screen.getByRole("button", { name: "Choose date" }));
    fireEvent.click(screen.getAllByRole("button", { name: "15" })[0] as HTMLElement);

    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-15$/));
  });

  it("navigates between months without changing the value", () => {
    const onChange = vi.fn();
    render(<DateTimeInput kind="date" value="2024-01-10" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Choose date" }));
    expect(screen.getByText("January 2024")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText("February 2024")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reflects an existing value as the trigger label and the selected day", () => {
    render(<DateTimeInput kind="date" value="2024-03-05" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Choose date" })).toHaveTextContent("2024-03-05");
  });
});

describe("DateTimeInput (time)", () => {
  it("auto-advances from hour to minute after two digits", () => {
    const onChange = vi.fn();
    render(<DateTimeInput kind="time" value="" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Hour"), { target: { value: "14" } });
    expect(screen.getByLabelText("Minute")).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith("");

    fireEvent.change(screen.getByLabelText("Minute"), { target: { value: "30" } });
    expect(onChange).toHaveBeenCalledWith("14:30");
  });

  it("strips non-digit characters and clamps out-of-range values", () => {
    const onChange = vi.fn();
    render(<DateTimeInput kind="time" value="" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Hour"), { target: { value: "9a9" } });
    fireEvent.change(screen.getByLabelText("Minute"), { target: { value: "75" } });

    expect(onChange).toHaveBeenLastCalledWith("23:59");
  });

  it("jumps back to the hour segment on backspace from an empty minute", () => {
    render(<DateTimeInput kind="time" value="09:15" onChange={vi.fn()} />);

    const minute = screen.getByLabelText("Minute");
    fireEvent.change(minute, { target: { value: "" } });
    fireEvent.keyDown(minute, { key: "Backspace" });

    expect(screen.getByLabelText("Hour")).toHaveFocus();
  });

  it("calls onEnter from either segment", () => {
    const onEnter = vi.fn();
    render(<DateTimeInput kind="time" value="09:15" onChange={vi.fn()} onEnter={onEnter} />);

    fireEvent.keyDown(screen.getByLabelText("Minute"), { key: "Enter" });
    expect(onEnter).toHaveBeenCalledTimes(1);
  });
});

describe("DateTimeInput (datetime-local)", () => {
  it("composes the date and time halves, joined by T, across separate interactions", () => {
    render(<Controlled kind="datetime-local" initial="" />);

    fireEvent.click(screen.getByRole("button", { name: "Choose date" }));
    fireEvent.click(screen.getAllByRole("button", { name: "20" })[0] as HTMLElement);
    expect(screen.getByRole("button", { name: "Choose date" })).toHaveTextContent(/\d{4}-\d{2}-20/);

    fireEvent.change(screen.getByLabelText("Hour"), { target: { value: "08" } });
    fireEvent.change(screen.getByLabelText("Minute"), { target: { value: "45" } });
    expect(screen.getByLabelText("Hour")).toHaveValue("08");
    expect(screen.getByLabelText("Minute")).toHaveValue("45");
  });

  it("splits an existing datetime-local value into the date button and time segments", () => {
    render(<DateTimeInput kind="datetime-local" value="2024-06-01T13:20" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Choose date" })).toHaveTextContent("2024-06-01");
    expect(screen.getByLabelText("Hour")).toHaveValue("13");
    expect(screen.getByLabelText("Minute")).toHaveValue("20");
  });
});
