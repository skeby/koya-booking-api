import { z } from "zod";
import { ValidationError } from "../lib/errors.js";
import { parse } from "../lib/validate.js";
import { Booking, IdempotencyRecord, RateLimit, Slot, type SlotDoc } from "../models/index.js";

export interface SlotDto {
  id: string;
  provider: string;
  start: string;
  end: string;
}

export interface SlotWithAvailabilityDto extends SlotDto {
  available: boolean;
}

const datetime = (field: string) =>
  z
    .string({ error: `${field} must be a date-time string` })
    .refine((value) => !Number.isNaN(Date.parse(value)), `${field} must be a valid date-time`);

const reset_schema = z.object(
  {
    slots: z.array(
      z.object(
        {
          id: z.string({ error: "each slot needs a string id" }).min(1, "each slot needs a non-empty id"),
          provider: z.string({ error: "each slot needs a string provider" }),
          start: datetime("start"),
          end: datetime("end"),
        },
        { error: "each slot must be an object" },
      ),
      { error: "slots must be an array" },
    ),
  },
  { error: "request body must be a JSON object" },
);

export function to_slot_dto(slot: Pick<SlotDoc, "slot_id" | "provider" | "start" | "end">): SlotDto {
  return { id: slot.slot_id, provider: slot.provider, start: slot.start, end: slot.end };
}

/**
 * POST /reset: delete every booking and replace all slots (past ones
 * included). Idempotency keys and rate-limit windows are cleared too: they
 * describe bookings that no longer exist, and a stored replay would point at
 * a deleted booking id.
 */
export async function reset_slots(body: unknown): Promise<{ slot_count: number }> {
  const { slots } = parse(reset_schema, body);

  const ids = new Set<string>();
  for (const slot of slots) {
    if (ids.has(slot.id)) throw new ValidationError(`duplicate slot id "${slot.id}"`);
    ids.add(slot.id);
  }

  await Promise.all([
    Booking.deleteMany({}),
    Slot.deleteMany({}),
    IdempotencyRecord.deleteMany({}),
    RateLimit.deleteMany({}),
  ]);

  if (slots.length > 0) {
    await Slot.insertMany(
      slots.map((slot) => ({
        slot_id: slot.id,
        provider: slot.provider,
        start: slot.start,
        end: slot.end,
        start_at: new Date(slot.start),
        end_at: new Date(slot.end),
      })),
    );
  }

  return { slot_count: slots.length };
}

/** GET /slots: every slot (optionally one provider's), earliest start first. */
export async function list_slots(provider?: string): Promise<SlotWithAvailabilityDto[]> {
  const filter = provider !== undefined ? { provider } : {};
  const slots = await Slot.find(filter).sort({ start_at: 1, slot_id: 1 }).lean();

  const booked = new Set<string>(
    await Booking.distinct("slot_id", {
      status: "confirmed",
      slot_id: { $in: slots.map((slot) => slot.slot_id) },
    }),
  );

  return slots.map((slot) => ({ ...to_slot_dto(slot), available: !booked.has(slot.slot_id) }));
}
