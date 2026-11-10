import type { NextFunction, Request, Response } from "express";
import { connect_db } from "../lib/db.js";

/** Make sure the (cached) MongoDB connection is ready before a route runs. */
export function ensure_db(_req: Request, _res: Response, next: NextFunction): void {
  connect_db().then(() => next(), next);
}
