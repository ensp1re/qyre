import type { ConnectionTarget } from "@humb/core";
import type { AdapterFactory, DatabaseAdapter } from "./contract.js";
import { UnsupportedEngineError } from "./errors.js";

/** Resolve the first factory that supports the target, or throw. */
export function resolveAdapter(
  factories: readonly AdapterFactory[],
  target: ConnectionTarget
): DatabaseAdapter {
  const factory = factories.find((candidate) => candidate.supports(target));
  if (!factory) {
    throw new UnsupportedEngineError(target.engine);
  }
  return factory.create(target);
}
