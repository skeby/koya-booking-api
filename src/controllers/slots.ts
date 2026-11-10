import type { Request, Response } from "express";
import { async_handler } from "../lib/async-handler.js";
import { ValidationError } from "../lib/errors.js";
import * as slots_service from "../services/slots.js";

/** POST /reset */
export const reset = async_handler(async (req: Request, res: Response) => {
  const { slot_count } = await slots_service.reset_slots(req.body);
  res.json({ ok: true, slot_count });
});

/** GET /slots?provider= */
export const list_slots = async_handler(async (req: Request, res: Response) => {
  const { provider } = req.query;
  if (provider !== undefined && typeof provider !== "string") {
    throw new ValidationError("provider must be given once");
  }
  const slots = await slots_service.list_slots(provider);
  res.json({ slots });
});
