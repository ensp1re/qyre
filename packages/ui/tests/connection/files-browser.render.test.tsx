import type { FileNode } from "@qyre/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilesBrowser } from "../../src/connection/files-browser.js";

const tree: FileNode[] = [{ name: "seed.sql", path: "seed.sql", type: "file" }];

describe("FilesBrowser 'Run in editor' (component rendering, F062)", () => {
  it("shows no 'Run in editor' button when onRunInEditor isn't provided", () => {
    render(
      <FilesBrowser
        tree={tree}
        selectedPath="seed.sql"
        onSelectFile={vi.fn()}
        content="SELECT 1;"
      />
    );
    expect(screen.queryByText("Run in editor")).not.toBeInTheDocument();
  });

  it("shows no 'Run in editor' button while no file is selected", () => {
    render(<FilesBrowser tree={tree} onSelectFile={vi.fn()} onRunInEditor={vi.fn()} />);
    expect(screen.queryByText("Run in editor")).not.toBeInTheDocument();
  });

  it("shows 'Run in editor' and calls onRunInEditor with the file's content when clicked", () => {
    const onRunInEditor = vi.fn();
    render(
      <FilesBrowser
        tree={tree}
        selectedPath="seed.sql"
        onSelectFile={vi.fn()}
        content="SELECT * FROM users;"
        onRunInEditor={onRunInEditor}
      />
    );
    fireEvent.click(screen.getByText("Run in editor"));
    expect(onRunInEditor).toHaveBeenCalledWith("SELECT * FROM users;");
  });
});

describe("FilesBrowser truncated preview (F133)", () => {
  it("shows a truncation notice when contentTruncated is true", () => {
    render(
      <FilesBrowser
        tree={tree}
        selectedPath="seed.sql"
        onSelectFile={vi.fn()}
        content="SELECT * FROM users"
        contentTruncated={true}
      />
    );
    expect(screen.getByText(/too large to preview in full/i)).toBeInTheDocument();
  });

  it("shows no truncation notice when the preview is complete", () => {
    render(
      <FilesBrowser
        tree={tree}
        selectedPath="seed.sql"
        onSelectFile={vi.fn()}
        content="SELECT 1;"
        contentTruncated={false}
      />
    );
    expect(screen.queryByText(/too large to preview in full/i)).not.toBeInTheDocument();
  });

  it("hides 'Run in editor' for a truncated preview even when onRunInEditor is provided", () => {
    render(
      <FilesBrowser
        tree={tree}
        selectedPath="seed.sql"
        onSelectFile={vi.fn()}
        content="SELECT * FROM users"
        contentTruncated={true}
        onRunInEditor={vi.fn()}
      />
    );
    expect(screen.queryByText("Run in editor")).not.toBeInTheDocument();
  });
});
