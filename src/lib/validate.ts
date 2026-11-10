import type { ZodType } from "zod";
import { ValidationError } from "./errors.js";

/**
 * Parse request data against a zod schema, converting a failure into the
 * domain ValidationError (400 { error }) using the first issue's message.
 * Schemas spell out their own messages, so they read well on their own.
 */
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message ?? "Invalid request");
  }
  return result.data;
}

/** Deliberately simple: one "@", no spaces, a dot in the domain. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trim and lower-case an email so lookups, rate limits and storage all agree. */
export function normalize_email(value: string): string {
  return value.trim().toLowerCase();
}
