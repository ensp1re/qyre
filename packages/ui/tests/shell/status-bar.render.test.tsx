import type { ConnectionCapabilities } from "@qyre/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBar } from "../../src/shell/status-bar.js";

const WRITABLE: ConnectionCapabilities = {
  supportsSql: true,
  supportsRowMutations: true,
  supportsDdl: true,
  supportsIndexManagement: true,
  supportsDatabaseManagement: true,
  supportsTransactions: true,
  readOnlyReason: null
};

const READ_ONLY_GRANTS: ConnectionCapabilities = {
  supportsSql: true,
  supportsRowMutations: false,
  supportsDdl: false,
  supportsIndexManagement: false,
  supportsDatabaseManagement: false,
  supportsTransactions: false,
  readOnlyReason: "grants"
};

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

  it("shows no access badge until capabilities are known (F097)", () => {
    render(<StatusBar status="connected" target="postgres://localhost/db" />);
    expect(screen.queryByTestId("access-badge")).not.toBeInTheDocument();
  });

  it("shows a read-write badge when any capability is writable (F097)", () => {
    render(
      <StatusBar status="connected" target="postgres://localhost/db" capabilities={WRITABLE} />
    );
    const badge = screen.getByTestId("access-badge");
    expect(badge).toHaveAttribute("data-access", "read-write");
    expect(badge).toHaveTextContent("read-write");
  });

  it("shows a read-only badge explaining the qyre --read-only flag reason (F096/F097)", () => {
    render(
      <StatusBar
        status="connected"
        target="postgres://localhost/db"
        capabilities={{ ...READ_ONLY_GRANTS, readOnlyReason: "qyre-flag" }}
      />
    );
    const badge = screen.getByTestId("access-badge");
    expect(badge).toHaveAttribute("data-access", "read-only");
    expect(badge).toHaveAttribute("title", "Read-only: qyre --read-only flag");
  });

  it("shows a read-only badge explaining the grants reason (F092-F095/F097)", () => {
    render(
      <StatusBar
        status="connected"
        target="postgres://localhost/db"
        capabilities={READ_ONLY_GRANTS}
      />
    );
    expect(screen.getByTestId("access-badge")).toHaveAttribute(
      "title",
      "Read-only: your database role has no write grants"
    );
  });

  it("shows a read-only badge explaining the replica reason (F092/F097)", () => {
    render(
      <StatusBar
        status="connected"
        target="postgres://localhost/db"
        capabilities={{ ...READ_ONLY_GRANTS, readOnlyReason: "replica" }}
      />
    );
    expect(screen.getByTestId("access-badge")).toHaveAttribute(
      "title",
      "Read-only: replica connection"
    );
  });
});
