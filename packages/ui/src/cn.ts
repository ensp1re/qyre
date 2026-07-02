import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names, resolving conflicts (e.g. `p-2 p-4` -> `p-4`). shadcn-style helper. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
