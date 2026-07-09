import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  composeConnectionString,
  ConnectDrawer,
  parsePastedConnectionString
} from "../../src/connection/connect-drawer.js";

function paste(element: Element, text: string): void {
  fireEvent.paste(element, { clipboardData: { getData: () => text } });
}

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

describe("parsePastedConnectionString", () => {
  it("splits a full postgres URL into discrete fields", () => {
    expect(parsePastedConnectionString("postgres://alice:s3cret@db.example.com:5433/mydb")).toEqual(
      {
        engine: "postgres",
        host: "db.example.com",
        port: "5433",
        user: "alice",
        password: "s3cret",
        database: "mydb"
      }
    );
  });

  it("maps mongodb+srv to the mongodb engine", () => {
    expect(parsePastedConnectionString("mongodb+srv://user@cluster.mongodb.net/app")?.engine).toBe(
      "mongodb"
    );
  });

  it("returns null for plain text that isn't a connection URL", () => {
    expect(parsePastedConnectionString("db.example.com")).toBeNull();
    expect(parsePastedConnectionString("not a url at all")).toBeNull();
  });

  it("returns null for an unsupported URL scheme", () => {
    expect(parsePastedConnectionString("https://example.com/db")).toBeNull();
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

  it("clears a stale draft when reopened after being closed without connecting", () => {
    // The drawer never unmounts (it's translated off-canvas, not removed), so without an
    // open-triggered reset a value typed before canceling would still be sitting there the next
    // time a user opens it to switch databases again.
    const { rerender } = render(<ConnectDrawer {...baseProps} onConnect={vi.fn()} />);
    fireEvent.click(screen.getByText("Use fields instead"));
    fireEvent.change(screen.getByLabelText("Host"), { target: { value: "typed-host" } });
    expect(screen.getByLabelText("Host")).toHaveValue("typed-host");

    rerender(<ConnectDrawer {...baseProps} open={false} onConnect={vi.fn()} />);
    rerender(<ConnectDrawer {...baseProps} open onConnect={vi.fn()} />);

    expect(screen.queryByLabelText("Host")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("postgres://user:pass@host:5432/db")).toHaveValue("");
  });

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

  it("auto-fills every field when a full connection string is pasted into any one of them", () => {
    render(<ConnectDrawer {...baseProps} onConnect={vi.fn()} />);
    fireEvent.click(screen.getByText("Use fields instead"));

    paste(screen.getByLabelText("Host"), "mysql://root:hunter2@db.internal:3307/app");

    expect(screen.getByRole("button", { name: "MySQL" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Host")).toHaveValue("db.internal");
    expect(screen.getByLabelText("Port")).toHaveValue("3307");
    expect(screen.getByLabelText("User")).toHaveValue("root");
    expect(screen.getByLabelText("Password")).toHaveValue("hunter2");
    expect(screen.getByLabelText("Database")).toHaveValue("app");
  });

  it("clears the other fields when switching engine tabs", () => {
    render(<ConnectDrawer {...baseProps} onConnect={vi.fn()} />);
    fireEvent.click(screen.getByText("Use fields instead"));

    fireEvent.change(screen.getByLabelText("Host"), { target: { value: "db.internal" } });
    fireEvent.change(screen.getByLabelText("User"), { target: { value: "root" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter2" } });
    fireEvent.change(screen.getByLabelText("Database"), { target: { value: "app" } });

    fireEvent.click(screen.getByRole("button", { name: "MySQL" }));

    expect(screen.getByLabelText("Host")).toHaveValue("");
    expect(screen.getByLabelText("User")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByLabelText("Database")).toHaveValue("");
  });

  it("leaves an ordinary paste of non-URL text to the default single-field behavior", () => {
    render(<ConnectDrawer {...baseProps} onConnect={vi.fn()} />);
    fireEvent.click(screen.getByText("Use fields instead"));

    const hostInput = screen.getByLabelText("Host");
    paste(hostInput, "db.internal");

    // No auto-fill happened - the paste event wasn't prevented, so this only asserts the other
    // fields stayed untouched (jsdom's fireEvent.paste doesn't itself insert text into the input).
    expect(screen.getByLabelText("User")).toHaveValue("");
    expect(screen.getByLabelText("Database")).toHaveValue("");
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
