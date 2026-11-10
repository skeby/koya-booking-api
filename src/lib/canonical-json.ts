import { createHash } from "node:crypto";

/**
 * JSON with object keys sorted at every level, so two bodies that differ only
 * in key order produce the same string (and the same idempotency hash).
 */
export function canonical_json(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical_json).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical_json((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
