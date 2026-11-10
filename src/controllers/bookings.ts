import type { Request, Response } from "express";
import { async_handler } from "../lib/async-handler.js";
import * as bookings_service from "../services/bookings.js";
import { with_idempotency } from "../services/idempotency.js";
import { capture_outcome, type Outcome } from "../services/outcome.js";

function send(res: Response, outcome: Outcome): void {
  res.status(outcome.status).set(outcome.headers ?? {}).json(outcome.body);
}

/** POST /bookings (Idempotency-Key optional) */
export const create_booking = async_handler(async (req: Request, res: Response) => {
  const run = () => capture_outcome(201, () => bookings_service.create_booking(req.body));

  const key = req.get("idempotency-key")?.trim();
  send(res, key ? await with_idempotency(key, req.body, run) : await run());
});

/** GET /bookings?email=&limit=&cursor= */
export const list_bookings = async_handler(async (req: Request, res: Response) => {
  res.json(await bookings_service.list_bookings(req.query));
});

/** GET /bookings/:id */
export const get_booking = async_handler(async (req: Request, res: Response) => {
  res.json(await bookings_service.get_booking(req.params.id ?? ""));
});

/** DELETE /bookings/:id */
export const cancel_booking = async_handler(async (req: Request, res: Response) => {
  res.json(await bookings_service.cancel_booking(req.params.id ?? ""));
});
