import { setTimeout as sleep } from "node:timers/promises";
import { canonical_json, sha256 } from "../lib/canonical-json.js";
import { ConflictError, is_duplicate_key_error, UnprocessableError } from "../lib/errors.js";
import { IdempotencyRecord } from "../models/index.js";
import type { Outcome } from "./outcome.js";

const POLL_INTERVAL_MS = 50;
const WAIT_FOR_OWNER_MS = 10_000;
/** A claim this old belongs to a request that died mid-flight; take it over. */
const STALE_CLAIM_MS = 30_000;

async function claim(key: string, request_hash: string): Promise<boolean> {
  try {
    await IdempotencyRecord.create({ key, request_hash, state: "processing", created_at: new Date() });
    return true;
  } catch (err) {
    if (is_duplicate_key_error(err)) return false;
    throw err;
  }
}

/**
 * Run the request as the key's owner and store what it returned. A 429 or a
 * server error is not a final answer, so the key is released and a later
 * retry with the same key runs again instead of replaying the failure.
 */
async function run_as_owner(key: string, run: () => Promise<Outcome>): Promise<Outcome> {
  let outcome: Outcome;
  try {
    outcome = await run();
  } catch (err) {
    await IdempotencyRecord.deleteOne({ key });
    throw err;
  }

  if (outcome.status === 429 || outcome.status >= 500) {
    await IdempotencyRecord.deleteOne({ key });
  } else {
    await IdempotencyRecord.updateOne(
      { key },
      { $set: { state: "done", status_code: outcome.status, response_body: outcome.body } },
    );
  }
  return outcome;
}

/**
 * Level 4: the same Idempotency-Key with the same body gets the same response
 * (status and booking id) and never books twice; the same key with a different
 * body gets 422.
 *
 * The first request to insert the key owns it. Any other request with that
 * key (a retry, or a duplicate sent at the same moment) waits for the owner
 * to finish and then replays its stored response.
 */
export async function with_idempotency(
  key: string,
  request_body: unknown,
  run: () => Promise<Outcome>,
): Promise<Outcome> {
  const request_hash = sha256(canonical_json(request_body));
  const deadline = Date.now() + WAIT_FOR_OWNER_MS;

  for (;;) {
    if (await claim(key, request_hash)) return run_as_owner(key, run);

    const record = await IdempotencyRecord.findOne({ key }).lean();
    if (!record) continue; // released between our insert and read: try to claim again

    if (record.request_hash !== request_hash) {
      throw new UnprocessableError("This Idempotency-Key was already used with a different request body");
    }

    if (record.state === "done") {
      return { status: record.status_code ?? 200, body: record.response_body };
    }

    if (Date.now() - record.created_at.getTime() > STALE_CLAIM_MS) {
      const taken = await IdempotencyRecord.findOneAndUpdate(
        { key, state: "processing", created_at: record.created_at },
        { $set: { created_at: new Date() } },
      );
      if (taken) return run_as_owner(key, run);
    }

    if (Date.now() > deadline) {
      throw new ConflictError("A request with this Idempotency-Key is still being processed");
    }
    await sleep(POLL_INTERVAL_MS);
  }
}
