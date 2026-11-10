import { Schema, model } from "mongoose";

/**
 * One row per Idempotency-Key (level 4). The unique index on `key` lets
 * exactly one request claim a key; concurrent retries wait for the claimant's
 * stored response instead of running the booking again.
 */
const idempotency_record_schema = new Schema(
  {
    key: { type: String, required: true },
    request_hash: { type: String, required: true },
    state: { type: String, enum: ["processing", "done"], required: true },
    status_code: { type: Number },
    response_body: { type: Schema.Types.Mixed },
    created_at: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false, minimize: false },
);

idempotency_record_schema.index({ key: 1 }, { unique: true });
// Keys only need to outlive client retries; a day is plenty.
idempotency_record_schema.index({ created_at: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export const IdempotencyRecord = model("IdempotencyRecord", idempotency_record_schema);
