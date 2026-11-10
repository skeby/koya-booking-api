import { is_duplicate_key_error, RateLimitError } from "../lib/errors.js";
import { RateLimit } from "../models/index.js";

export const BOOKING_ATTEMPTS_PER_WINDOW = 5;
export const BOOKING_WINDOW_MS = 60_000;

interface RateLimitState {
  hits: Date[];
  checked_at: Date;
  allowed: boolean;
}

/**
 * One atomic read-modify-write per attempt, on the database clock ($$NOW) so
 * every API instance agrees on time: drop hits older than the window, then
 * record this attempt only if fewer than the limit remain. Because it is a
 * single-document update, concurrent attempts for the same email can't both
 * squeeze into the last free spot.
 */
const sliding_window_update = [
  {
    $set: {
      checked_at: "$$NOW",
      hits: {
        $filter: {
          input: { $ifNull: ["$hits", []] },
          as: "hit",
          cond: { $gt: ["$$hit", { $subtract: ["$$NOW", BOOKING_WINDOW_MS] }] },
        },
      },
    },
  },
  { $set: { allowed: { $lt: [{ $size: "$hits" }, BOOKING_ATTEMPTS_PER_WINDOW] } } },
  { $set: { hits: { $cond: ["$allowed", { $concatArrays: ["$hits", ["$$NOW"]] }, "$hits"] } } },
];

async function record_attempt(email: string): Promise<RateLimitState> {
  const run = () =>
    RateLimit.collection.findOneAndUpdate({ email }, sliding_window_update, {
      upsert: true,
      returnDocument: "after",
    });

  try {
    return (await run()) as unknown as RateLimitState;
  } catch (err) {
    // Two first-ever attempts for the same email can both try to insert;
    // the loser retries and now updates the winner's document.
    if (is_duplicate_key_error(err)) return (await run()) as unknown as RateLimitState;
    throw err;
  }
}

/**
 * Level 5: at most 5 booking attempts per email per minute, failed attempts
 * included. Throws a 429 with Retry-After (whole seconds until the oldest
 * attempt in the window expires) once the limit is reached.
 */
export async function enforce_booking_rate_limit(email: string): Promise<void> {
  const state = await record_attempt(email);
  if (state.allowed) return;

  const oldest = state.hits[0]?.getTime() ?? state.checked_at.getTime();
  const wait_ms = oldest + BOOKING_WINDOW_MS - state.checked_at.getTime();
  throw new RateLimitError(Math.max(1, Math.ceil(wait_ms / 1000)));
}
