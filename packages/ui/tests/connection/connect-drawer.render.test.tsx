import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { composeConnectionString, ConnectDrawer } from "../../src/connection/connect-drawer.js";

describe("composeConnectionString", () => {
  it("composes a full postgres connection string", () => {
    expect(
      composeConnectionString({
        engine: "postgres",
        host: "db.example.com",
        port: "5433",
        user: "alice",
        password: "s3cret",
        database: "mydb"
      })
    ).toBe("postgres://alice:s3cret@db.example.com:5433/mydb");
  });

  it("falls back to localhost and the engine's default port when blank", () => {
    expect(
      composeConnectionString({
        engine: "mysql",
        host: "",
        port: "",
        user: "",
        password: "",
        database: ""
      })
    ).toBe("mysql://localhost:3306");
  });

  it("omits the password segment when only a user is given", () => {
    expect(
      composeConnectionString({
        engine: "mongodb",
        host: "localhost",
        port: "",
        user: "alice",
        password: "",
        database: ""
      })
    ).toBe("mongodb://alice@localhost:27017");
  });

  it("percent-encodes special characters in user/password/database", () => {
    expect(
      composeConnectionString({
        engine: "postgres",
        host: "localhost",
        port: "5432",
        user: "a@b",
        password: "p@ss/word",
        database: "my db"
      })
    ).toBe("postgres://a%40b:p%40ss%2Fword@localhost:5432/my%20db");
  });
});

describe("ConnectDrawer", () => {
  const baseProps = {
    open: true,
    onOpenChange: vi.fn(),
    currentTarget: null,
    recentTargets: [],
    isConnecting: false
  };

  it("defaults to URL entry mode", () => {
    render(<ConnectDrawer {...baseProps} onConnect={vi.fn()} />);
    expect(screen.getByPlaceholderText("postgres://user:pass@host:5432/db")).toBeInTheDocument();
    expect(screen.queryByLabelText("Host")).not.toBeInTheDocument();
  });

  it("switches to fields mode and back via the toggle", () => {
    render(<ConnectDrawer {...baseProps} onConnect={vi.fn()} />);
    fireEvent.click(screen.getByText("Use fields instead"));
    expect(screen.getByLabelText("Host")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Paste a URL instead"));
    expect(screen.getByPlaceholderText("postgres://user:pass@host:5432/db")).toBeInTheDocument();
  });

  it("submits the composed connection string from the fields form", async () => {
    const onConnect = vi.fn().mockResolvedValue(undefined);
    render(<ConnectDrawer {...baseProps} onConnect={onConnect} />);
    fireEvent.click(screen.getByText("Use fields instead"));

    fireEvent.change(screen.getByLabelText("Host"), { target: { value: "db.internal" } });
    fireEvent.change(screen.getByLabelText("User"), { target: { value: "root" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter2" } });
    fireEvent.change(screen.getByLabelText("Database"), { target: { value: "app" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(onConnect).toHaveBeenCalledWith("postgres://root:hunter2@db.internal:5432/app");
  });

  it("shows the rejection message inline when onConnect fails", async () => {
    const onConnect = vi.fn().mockRejectedValue(new Error("Connection refused"));
    render(<ConnectDrawer {...baseProps} onConnect={onConnect} />);
    fireEvent.change(screen.getByPlaceholderText("postgres://user:pass@host:5432/db"), {
      target: { value: "postgres://localhost/db" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Connection refused");
  });
});
