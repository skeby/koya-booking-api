import { AppError } from "../lib/errors.js";

/** A finished HTTP answer, kept as data so it can be stored and replayed. */
export interface Outcome {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

/**
 * Run a handler and capture its result, turning expected (domain) errors
 * into their `{ error }` response. Unexpected errors still throw, so they
 * reach the central error handler and are never stored as a replay.
 */
export async function capture_outcome(status: number, run: () => Promise<unknown>): Promise<Outcome> {
  try {
    return { status, body: await run() };
  } catch (err) {
    if (err instanceof AppError) {
      return { status: err.status, body: { error: err.message }, headers: err.headers };
    }
    throw err;
  }
}
