import { Long } from "mongodb";

const INTEGER_TEXT = /^[+-]?\d+$/;
const INT64_MIN = -(BigInt(2) ** BigInt(63));
const INT64_MAX = BigInt(2) ** BigInt(63) - BigInt(1);

/** Parse base-10 integer text as an exact signed 64-bit integer. */
export function int64FromText(text: string): bigint | undefined {
  const trimmed = text.trim();
  if (!INTEGER_TEXT.test(trimmed)) return undefined;
  const integer = BigInt(trimmed);
  return integer >= INT64_MIN && integer <= INT64_MAX ? integer : undefined;
}

/** Represent an exact integer as a JS number when safe, otherwise as a BSON Int64. */
export function exactInteger(integer: bigint): number | Long {
  return integer >= BigInt(Number.MIN_SAFE_INTEGER) && integer <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(integer)
    : Long.fromBigInt(integer);
}
