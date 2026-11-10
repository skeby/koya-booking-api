import { Schema, model } from "mongoose";

/**
 * Sliding-window attempt log per email (level 5). `hits` holds the times of
 * the attempts inside the current window; `checked_at` is the database clock
 * at the last check and drives the TTL cleanup of idle emails.
 */
const rate_limit_schema = new Schema(
  {
    email: { type: String, required: true },
    hits: { type: [Date], default: [] },
    checked_at: { type: Date },
    allowed: { type: Boolean },
  },
  { versionKey: false },
);

rate_limit_schema.index({ email: 1 }, { unique: true });
rate_limit_schema.index({ checked_at: 1 }, { expireAfterSeconds: 60 * 60 });

export const RateLimit = model("RateLimit", rate_limit_schema);
