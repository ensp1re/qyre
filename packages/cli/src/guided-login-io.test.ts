import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStreamGuidedLoginIO, type GuidedLoginStream } from "./guided-login-io.js";

function makeStreams(isTTY: boolean): {
  input: GuidedLoginStream & PassThrough;
  output: PassThrough;
  setRawModeCalls: boolean[];
  written: () => string;
} {
  const input = new PassThrough() as GuidedLoginStream & PassThrough;
  const output = new PassThrough();
  const setRawModeCalls: boolean[] = [];
  input.isTTY = isTTY;
  input.setRawMode = (mode: boolean) => {
    setRawModeCalls.push(mode);
    return input;
  };

  let buffered = "";
  output.on("data", (chunk) => {
    buffered += chunk.toString("utf8");
  });

  return { input, output, setRawModeCalls, written: () => buffered };
}

describe("createStreamGuidedLoginIO", () => {
  afterEach(() => vi.restoreAllMocks());

  it("ask reads a line and echoes the question", async () => {
    const { input, output } = makeStreams(false);
    const io = createStreamGuidedLoginIO(input, output);

    const promise = io.ask("Host: ");
    input.write("db.example.com\n");

    expect(await promise).toBe("db.example.com");
  });

  it("ask trims surrounding whitespace", async () => {
    const { input, output } = makeStreams(false);
    const io = createStreamGuidedLoginIO(input, output);

    const promise = io.ask("Host: ");
    input.write("  db.example.com  \n");

    expect(await promise).toBe("db.example.com");
  });

  it("askMasked enables raw mode on a TTY, echoes `*` per keystroke, and restores it after enter", async () => {
    const { input, output, setRawModeCalls, written } = makeStreams(true);
    const io = createStreamGuidedLoginIO(input, output);

    const promise = io.askMasked("Password: ");
    input.write("secret\n");

    expect(await promise).toBe("secret");
    expect(setRawModeCalls).toEqual([true, false]);
    expect(written()).toBe("Password: ******\n");
  });

  it("askMasked handles backspace by erasing the last character", async () => {
    const { input, output } = makeStreams(true);
    const io = createStreamGuidedLoginIO(input, output);
    const backspace = String.fromCharCode(127);

    const promise = io.askMasked("Password: ");
    input.write(`secretxx${backspace}${backspace}\n`);

    expect(await promise).toBe("secret");
  });

  it("askMasked does not mask against a non-TTY stream, since there's no terminal echo to suppress", async () => {
    const { input, output, setRawModeCalls } = makeStreams(false);
    const io = createStreamGuidedLoginIO(input, output);

    const promise = io.askMasked("Password: ");
    input.write("secret\n");

    expect(await promise).toBe("secret");
    expect(setRawModeCalls).toEqual([]);
  });

  it("askMasked restores cooked mode before exiting on Ctrl-C", () => {
    const { input, output, setRawModeCalls } = makeStreams(true);
    const events: string[] = [];
    input.setRawMode = (mode: boolean) => {
      setRawModeCalls.push(mode);
      events.push(`raw:${mode}`);
    };
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      events.push("exit");
    }) as never);
    const io = createStreamGuidedLoginIO(input, output);

    void io.askMasked("Password: ");
    input.write(String.fromCharCode(3));

    expect(exit).toHaveBeenCalledWith(130);
    expect(setRawModeCalls).toEqual([true, false]);
    expect(events).toEqual(["raw:true", "raw:false", "exit"]);
  });

  it("carries extra answers past the first newline over to the next ask (bulk/piped input)", async () => {
    const { input, output } = makeStreams(false);
    const io = createStreamGuidedLoginIO(input, output);

    const first = io.ask("User: ");
    // Piped input commonly arrives as one chunk containing every answer at once.
    input.write("alice\nsecret\ndb.example.com\n");

    expect(await first).toBe("alice");
    expect(await io.ask("Password: ")).toBe("secret");
    expect(await io.ask("Host: ")).toBe("db.example.com");
  });

  it("writeLine appends a single trailing newline", () => {
    const { input, output, written } = makeStreams(false);
    const io = createStreamGuidedLoginIO(input, output);

    io.writeLine("hello");

    expect(written()).toBe("hello\n");
  });
});
