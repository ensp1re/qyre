/**
 * Real stdin/stdout wiring for `GuidedLoginPrompts` (see `guided-login.ts`). Takes injectable
 * streams (defaulting to `process.stdin`/`process.stdout`) so masking can be exercised in tests
 * against a plain stream instead of a real TTY.
 */
import type { GuidedLoginPrompts } from "./guided-login.js";

export interface GuidedLoginStream extends NodeJS.ReadableStream {
  isTTY?: boolean;
  setRawMode?: (mode: boolean) => void;
}

const ENTER_CHARS = new Set(["\n", "\r"]);
const CTRL_C_CHAR = String.fromCharCode(3);
const BACKSPACE_CHARS = new Set([String.fromCharCode(127), "\b"]);

/** Builds a `GuidedLoginPrompts` backed by `input`/`output`. In a real TTY, `askMasked` disables
 * local echo and substitutes `*` per keystroke; against a plain (non-TTY) stream it just reads a
 * line, since there's no terminal echo to suppress either way. */
export function createStreamGuidedLoginIO(
  input: GuidedLoginStream,
  output: NodeJS.WritableStream
): GuidedLoginPrompts {
  // Characters received past a line's terminator, carried over to the next prompt - piped/scripted
  // input commonly arrives as one chunk containing every answer, and only reading up to the first
  // newline of whatever chunk happens to be current would silently drop the rest.
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

      // Consumes `text` char-by-char; returns true once a full line was found (and resolved),
      // stashing anything past the terminator in `leftover` for the next `readLine` call.
      function consume(text: string): boolean {
        for (let i = 0; i < text.length; i++) {
          const char = text[i]!;
          if (ENTER_CHARS.has(char)) {
            leftover = text.slice(i + 1);
            finish(buffer);
            return true;
          }
          if (char === CTRL_C_CHAR) {
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
