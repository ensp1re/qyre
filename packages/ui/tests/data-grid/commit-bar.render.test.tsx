import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommitBar } from "../../src/data-grid/commit-bar.js";

describe("CommitBar (component rendering, F105)", () => {
  it("renders nothing when the buffer is empty", () => {
    const { container } = render(
      <CommitBar
        insertCount={0}
        updateCount={0}
        deleteCount={0}
        previewLines={[]}
        onCommit={vi.fn()}
        onDiscard={vi.fn()}
        committing={false}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("summarizes staged counts by kind", () => {
    render(
      <CommitBar
        insertCount={1}
        updateCount={2}
        deleteCount={3}
        previewLines={["a", "b", "c"]}
        onCommit={vi.fn()}
        onDiscard={vi.fn()}
        committing={false}
      />
    );
    expect(screen.getByText("1 to insert, 2 to update, 3 to delete")).toBeInTheDocument();
  });

  it("hides the preview list until the summary is clicked", () => {
    render(
      <CommitBar
        insertCount={1}
        updateCount={0}
        deleteCount={0}
        previewLines={["INSERT INTO users ..."]}
        onCommit={vi.fn()}
        onDiscard={vi.fn()}
        committing={false}
      />
    );
    expect(screen.queryByText("INSERT INTO users ...")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("1 to insert"));
    expect(screen.getByText("INSERT INTO users ...")).toBeInTheDocument();
  });

  it("calls onCommit when Commit is clicked", () => {
    const onCommit = vi.fn();
    render(
      <CommitBar
        insertCount={1}
        updateCount={0}
        deleteCount={0}
        previewLines={["x"]}
        onCommit={onCommit}
        onDiscard={vi.fn()}
        committing={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Commit" }));
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it("calls onDiscard when Discard is clicked", () => {
    const onDiscard = vi.fn();
    render(
      <CommitBar
        insertCount={1}
        updateCount={0}
        deleteCount={0}
        previewLines={["x"]}
        onCommit={vi.fn()}
        onDiscard={onDiscard}
        committing={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /discard/i }));
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it("disables Commit and Discard while committing", () => {
    render(
      <CommitBar
        insertCount={1}
        updateCount={0}
        deleteCount={0}
        previewLines={["x"]}
        onCommit={vi.fn()}
        onDiscard={vi.fn()}
        committing={true}
      />
    );
    expect(screen.getByRole("button", { name: /committing/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /discard/i })).toBeDisabled();
  });

  it("shows an error message when the commit failed", () => {
    render(
      <CommitBar
        insertCount={1}
        updateCount={0}
        deleteCount={0}
        previewLines={["x"]}
        onCommit={vi.fn()}
        onDiscard={vi.fn()}
        committing={false}
        error="Commit failed and was rolled back at operation 2."
      />
    );
    expect(
      screen.getByText("Commit failed and was rolled back at operation 2.")
    ).toBeInTheDocument();
  });

  it("highlights the failed operation's preview line", () => {
    render(
      <CommitBar
        insertCount={2}
        updateCount={0}
        deleteCount={0}
        previewLines={["INSERT ok", "INSERT bad"]}
        onCommit={vi.fn()}
        onDiscard={vi.fn()}
        committing={false}
        error="Commit failed."
        failedIndex={1}
      />
    );
    fireEvent.click(screen.getByText("2 to insert"));
    const failedLine = screen.getByText("INSERT bad");
    expect(failedLine.className).toMatch(/text-\[var\(--c-red\)\]/);
  });
});
