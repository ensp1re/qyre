#!/usr/bin/env node
import { InvalidConnectionTargetError } from "@qyre/core";
import { CommanderError } from "commander";
import { main } from "./index.js";

main().catch((error: unknown) => {
  // Commander throws for successful --help/--version when exitOverride is enabled.
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
