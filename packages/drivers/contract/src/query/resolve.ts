import type { ConnectionTarget } from "@qyre/core";
import type { AdapterFactory, DatabaseAdapter } from "../types/contract.js";
import { UnsupportedEngineError } from "../safety/errors.js";

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
