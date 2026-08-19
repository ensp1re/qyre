#!/usr/bin/env node
import { InvalidConnectionTargetError } from "@qyre/core";
import { CommanderError } from "commander";
import { main } from "./index.js";

main().catch((error: unknown) => {
  // `parseArgs` sets commander's `exitOverride()`, so `--help` and `--version` write their output
  // and then *throw* instead of exiting. Both are a successful run: without this, `qyre --help`
  // printed the whole help text and still exited 1 with a spurious
  // "Qyre failed to start: (outputHelp)" on stderr. Commander marks exactly these with
  // `exitCode: 0`; a real parse failure (unknown flag, bad port) keeps its non-zero code and falls
  // through to the handling below.
  if (error instanceof CommanderError && error.exitCode === 0) {
    process.exit(0);
  }
  if (error instanceof InvalidConnectionTargetError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write(`Qyre failed to start: ${(error as Error).message}\n`);
  }
  process.exit(1);
});
