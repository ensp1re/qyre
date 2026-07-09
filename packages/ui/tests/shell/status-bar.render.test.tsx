import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBar } from "../../src/shell/status-bar.js";

describe("StatusBar", () => {
  it("shows the database name (the target's final path segment) after the schema", () => {
    render(
      <StatusBar
        status="connected"
        schema="public"
        target="postgres://postgres:postgres@localhost:5432/qyre_test"
      />
    );

    expect(screen.getByText("public")).toBeInTheDocument();
    expect(screen.getByText("qyre_test")).toBeInTheDocument();
  });

  it("shows the database name even when no table (and so no schema) is selected yet", () => {
    render(<StatusBar status="connected" target="postgres://localhost:5432/qyre_test" />);
    expect(screen.getByText("qyre_test")).toBeInTheDocument();
  });

  it("omits the database name when disconnected (no target)", () => {
    render(<StatusBar status="unconfigured" target={null} />);
    expect(screen.queryByText("qyre_test")).not.toBeInTheDocument();
  });

  it("no longer shows a hardcoded encoding label", () => {
    render(<StatusBar status="connected" target="postgres://localhost/db" />);
    expect(screen.queryByText("UTF-8")).not.toBeInTheDocument();
  });

  it("derives the database name from a SQLite file path the same way", () => {
    render(<StatusBar status="connected" target="/home/dev/data/app.sqlite" />);
    expect(screen.getByText("app.sqlite")).toBeInTheDocument();
  });
});
