import { Schema, model, type InferSchemaType } from "mongoose";

export const BOOKING_STATUSES = ["confirmed", "cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

const booking_schema = new Schema(
  {
    slot_id: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    status: { type: String, enum: BOOKING_STATUSES, required: true, default: "confirmed" },
    created_at: { type: Date, required: true, default: () => new Date() },
    cancelled_at: { type: Date },
  },
  { versionKey: false },
);

/**
 * The double-booking guard (level 3). At most one *confirmed* booking per
 * slot, enforced by MongoDB itself: when many requests race for the same
 * slot, exactly one insert succeeds and the rest fail with a duplicate-key
 * error (mapped to 409). Cancelled bookings fall outside the partial filter,
 * so cancelling frees the slot for a new booking.
 */
booking_schema.index(
  { slot_id: 1 },
  { unique: true, partialFilterExpression: { status: "confirmed" }, name: "one_confirmed_booking_per_slot" },
);

/** A person's bookings, oldest first, paged by (created_at, _id). */
booking_schema.index({ email: 1, created_at: 1, _id: 1 });

export type BookingDoc = InferSchemaType<typeof booking_schema>;
export const Booking = model("Booking", booking_schema);
