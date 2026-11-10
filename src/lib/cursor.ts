import { Types } from "mongoose";
import { ValidationError } from "./errors.js";

/** Position after which the next page starts: bookings sort by (created_at, _id). */
export interface CursorPosition {
  created_at: Date;
  id: Types.ObjectId;
}

/** Opaque to clients: base64url JSON of the last booking's sort key. */
export function encode_cursor({ created_at, id }: CursorPosition): string {
  return Buffer.from(JSON.stringify({ t: created_at.toISOString(), id: id.toHexString() })).toString("base64url");
}

export function decode_cursor(cursor: string): CursorPosition {
  try {
    const { t, id } = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { t?: unknown; id?: unknown };
    const created_at = typeof t === "string" ? new Date(t) : null;
    if (created_at && !Number.isNaN(created_at.getTime()) && typeof id === "string" && Types.ObjectId.isValid(id)) {
      return { created_at, id: new Types.ObjectId(id) };
    }
  } catch {
    // fall through to the error below
  }
  throw new ValidationError("cursor is not valid");
}
