import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * An appointment slot. `start`/`end` keep the exact strings the clinic sent
 * to /reset (so responses echo them back unchanged); `start_at`/`end_at` are
 * the parsed dates used for sorting and the "already started" check.
 */
const slot_schema = new Schema(
  {
    slot_id: { type: String, required: true },
    provider: { type: String, required: true },
    start: { type: String, required: true },
    end: { type: String, required: true },
    start_at: { type: Date, required: true },
    end_at: { type: Date, required: true },
  },
  { versionKey: false },
);

slot_schema.index({ slot_id: 1 }, { unique: true });
slot_schema.index({ provider: 1, start_at: 1 });
slot_schema.index({ start_at: 1, slot_id: 1 });

export type SlotDoc = InferSchemaType<typeof slot_schema>;
export const Slot = model("Slot", slot_schema);
