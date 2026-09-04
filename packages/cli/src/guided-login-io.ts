import type { GuidedLoginPrompts } from "./guided-login.js";

export interface GuidedLoginStream extends NodeJS.ReadableStream {
  isTTY?: boolean;
  setRawMode?: (mode: boolean) => void;
}

const ENTER_CHARS = new Set(["\n", "\r"]);
const CTRL_C_CHAR = String.fromCharCode(3);
const BACKSPACE_CHARS = new Set([String.fromCharCode(127), "\b"]);

/** Creates prompt IO with terminal masking when supported. */
export function createStreamGuidedLoginIO(
  input: GuidedLoginStream,
  output: NodeJS.WritableStream
): GuidedLoginPrompts {
  // Preserve input received after the first line terminator for the next prompt.
  let leftover = "";

  function readLine(question: string, masked: boolean): Promise<string> {
    return new Promise((resolve) => {
      output.write(question);
      const rawModeCapable = Boolean(input.isTTY && input.setRawMode);
      if (masked && rawModeCapable) input.setRawMode?.(true);

      let buffer = "";

      function finish(value: string): void {
        if (masked && rawModeCapable) input.setRawMode?.(false);
        output.write("\n");
        resolve(value.trim());
      }

      function consume(text: string): boolean {
        for (let i = 0; i < text.length; i++) {
          const char = text[i]!;
          if (ENTER_CHARS.has(char)) {
            leftover = text.slice(i + 1);
            finish(buffer);
            return true;
          }
          if (char === CTRL_C_CHAR) {
            if (masked && rawModeCapable) input.setRawMode?.(false);
            output.write("\n");
            process.exit(130);
          }
          if (BACKSPACE_CHARS.has(char)) {
            if (buffer.length > 0) {
              buffer = buffer.slice(0, -1);
              if (masked && rawModeCapable) output.write("\b \b");
            }
            continue;
          }
          buffer += char;
          if (masked && rawModeCapable) output.write("*");
        }
        return false;
      }

      if (leftover) {
        const carried = leftover;
        leftover = "";
        if (consume(carried)) return;
      }

      const onData = (chunk: Buffer | string): void => {
        if (consume(chunk.toString("utf8"))) {
          input.removeListener("data", onData);
        }
      };
      input.on("data", onData);
    });
  }

  return {
    writeLine: (text) => output.write(`${text}\n`),
    ask: (question) => readLine(question, false),
    askMasked: (question) => readLine(question, true)
  };
}

export function createTerminalGuidedLoginIO(): GuidedLoginPrompts {
  return createStreamGuidedLoginIO(process.stdin, process.stdout);
}
