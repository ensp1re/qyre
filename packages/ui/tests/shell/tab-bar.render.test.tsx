import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TabBar } from "../../src/shell/tab-bar.js";

describe("TabBar", () => {
  it("hides tabs that are not available for the current connection", () => {
    render(<TabBar active="tables" onChange={vi.fn()} hiddenTabs={["sql-editor"]} />);

    expect(screen.queryByRole("tab", { name: "SQL Editor" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tables" })).toBeVisible();
  });

  it("does not call onChange for hidden tabs", () => {
    const onChange = vi.fn();
    render(<TabBar active="tables" onChange={onChange} hiddenTabs={["sql-editor"]} />);

    fireEvent.click(screen.getByRole("tab", { name: "Tables" }));
    expect(onChange).toHaveBeenCalledWith("tables");
    expect(screen.queryByRole("tab", { name: "SQL Editor" })).not.toBeInTheDocument();
  });
});
