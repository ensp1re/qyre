import { DATABASE_ENGINES, redactConnectionString } from "@qyre/core";
import type { ConnectionTarget } from "@qyre/core";

export function displayTarget(target: ConnectionTarget): string {
  return target.engine === DATABASE_ENGINES.sqlite
    ? target.raw
    : redactConnectionString(target.raw);
}

const CREDENTIAL_QUERY_PARAM_PATTERN = /password|pwd|secret|token/i;
const USERINFO_PATTERN = /(:\/\/[^\s"'@/:]*):([^\s"'@/]*)@/g;
const QUERY_PARAM_PATTERN = /([?&])([^=&\s"']+)=([^&\s"')]*)/g;

/** Redacts credentials embedded in arbitrary driver error text. */
export function redactErrorMessage(message: string): string {
  return message
    .replace(USERINFO_PATTERN, "$1:***@")
    .replace(QUERY_PARAM_PATTERN, (match, separator: string, key: string) =>
      CREDENTIAL_QUERY_PARAM_PATTERN.test(key) ? `${separator}${key}=***` : match
    );
}

/** Unwraps aggregate connection errors and redacts their messages. */
export function describeError(error: unknown): string {
  if (error instanceof AggregateError && error.errors.length > 0) {
    return describeError(error.errors[0]);
  }
  if (error instanceof Error && error.message) {
    return redactErrorMessage(error.message);
  }
  return redactErrorMessage(String(error));
}
