import { Types } from "mongoose";
import { z } from "zod";
import { decode_cursor, encode_cursor } from "../lib/cursor.js";
import { ConflictError, is_duplicate_key_error, NotFoundError, ValidationError } from "../lib/errors.js";
import { EMAIL_PATTERN, normalize_email, parse } from "../lib/validate.js";
import { Booking, Slot, type BookingStatus } from "../models/index.js";
import { enforce_booking_rate_limit } from "./rate-limit.js";

export interface BookingDto {
  id: string;
  slot_id: string;
  name: string;
  email: string;
  status: BookingStatus;
  created_at: string;
}

interface BookingLike {
  _id: Types.ObjectId;
  slot_id: string;
  name: string;
  email: string;
  status: string;
  created_at: Date;
}

export function to_booking_dto(booking: BookingLike): BookingDto {
  return {
    id: booking._id.toHexString(),
    slot_id: booking.slot_id,
    name: booking.name,
    email: booking.email,
    status: booking.status as BookingStatus,
    created_at: booking.created_at.toISOString(),
  };
}

const required_text = (field: string, max: number) =>
  z
    .string({ error: `${field} is required` })
    .trim()
    .min(1, `${field} is required`)
    .max(max, `${field} must be at most ${max} characters`);

const new_booking_schema = z.object(
  {
    slot_id: required_text("slot_id", 200),
    name: required_text("name", 200),
    email: required_text("email", 254)
      .regex(EMAIL_PATTERN, "email is not a valid email address")
      .transform(normalize_email),
  },
  { error: "request body must be a JSON object" },
);

/** The email a booking attempt counts against, before any other validation. */
function attempt_email(body: unknown): string | null {
  const email = (body as { email?: unknown } | null)?.email;
  if (typeof email !== "string") return null;
  const normalized = normalize_email(email);
  return normalized.length > 0 ? normalized : null;
}

/**
 * POST /bookings. Order matters:
 *   1. rate limit (level 5): every attempt with an email counts, even ones
 *      that fail validation below;
 *   2. field validation (400), slot exists (404), slot not started (400);
 *   3. insert. The partial unique index on confirmed bookings decides races:
 *      a second confirmed booking for the slot is a duplicate key (409).
 */
export async function create_booking(body: unknown): Promise<BookingDto> {
  const email = attempt_email(body);
  if (email) await enforce_booking_rate_limit(email);

  const input = parse(new_booking_schema, body);

  const slot = await Slot.findOne({ slot_id: input.slot_id }).lean();
  if (!slot) throw new NotFoundError("slot not found");
  if (slot.start_at.getTime() <= Date.now()) {
    throw new ValidationError("slot has already started");
  }

  try {
    const booking = await Booking.create({
      slot_id: slot.slot_id,
      name: input.name,
      email: input.email,
      status: "confirmed",
      created_at: new Date(),
    });
    return to_booking_dto(booking);
  } catch (err) {
    if (is_duplicate_key_error(err)) throw new ConflictError("slot is already booked");
    throw err;
  }
}

function object_id_or_null(id: string): Types.ObjectId | null {
  return /^[0-9a-fA-F]{24}$/.test(id) ? new Types.ObjectId(id) : null;
}

/** GET /bookings/:id */
export async function get_booking(id: string): Promise<BookingDto> {
  const _id = object_id_or_null(id);
  const booking = _id ? await Booking.findById(_id).lean() : null;
  if (!booking) throw new NotFoundError("booking not found");
  return to_booking_dto(booking);
}

/**
 * DELETE /bookings/:id: cancel and free the slot. The status check and the
 * update are one atomic operation, so two cancels racing can't both succeed.
 */
export async function cancel_booking(id: string): Promise<BookingDto> {
  const _id = object_id_or_null(id);
  if (!_id) throw new NotFoundError("booking not found");

  const cancelled = await Booking.findOneAndUpdate(
    { _id, status: "confirmed" },
    { $set: { status: "cancelled", cancelled_at: new Date() } },
    { new: true },
  ).lean();
  if (cancelled) return to_booking_dto(cancelled);

  const exists = await Booking.exists({ _id });
  if (!exists) throw new NotFoundError("booking not found");
  throw new ConflictError("booking is already cancelled");
}

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

const single = (field: string) =>
  z.string({ error: `${field} must be given once` }).optional();

const list_query_schema = z.object({
  email: single("email"),
  limit: single("limit"),
  cursor: single("cursor"),
});

function parse_limit(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_PAGE_SIZE;
  const limit = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new ValidationError(`limit must be a whole number from 1 to ${MAX_PAGE_SIZE}`);
  }
  return limit;
}

/**
 * GET /bookings?email=&limit=&cursor= (level 4). A person's bookings, oldest
 * first, with cursor pagination: the cursor encodes the last booking's
 * (created_at, _id), so pages stay stable while new bookings are added.
 */
export async function list_bookings(query: unknown): Promise<{ bookings: BookingDto[]; next_cursor: string | null }> {
  const raw = parse(list_query_schema, query ?? {});

  const email = raw.email !== undefined ? normalize_email(raw.email) : "";
  if (!email) throw new ValidationError("email is required");

  const limit = parse_limit(raw.limit);

  const filter: Record<string, unknown> = { email };
  if (raw.cursor !== undefined) {
    const after = decode_cursor(raw.cursor);
    filter.$or = [
      { created_at: { $gt: after.created_at } },
      { created_at: after.created_at, _id: { $gt: after.id } },
    ];
  }

  // One extra row tells us whether another page exists.
  const rows = await Booking.find(filter).sort({ created_at: 1, _id: 1 }).limit(limit + 1).lean();
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];

  return {
    bookings: page.map(to_booking_dto),
    next_cursor: rows.length > limit && last ? encode_cursor({ created_at: last.created_at, id: last._id }) : null,
  };
}
