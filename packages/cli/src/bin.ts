#!/usr/bin/env node
import { InvalidConnectionTargetError } from "@humb/core";
import { main } from "./index.js";

main().catch((error: unknown) => {
  if (error instanceof InvalidConnectionTargetError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write(`Humb failed to start: ${(error as Error).message}\n`);
  }
  process.exit(1);
});
