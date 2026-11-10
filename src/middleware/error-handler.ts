import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors.js";

/** body-parser errors carry a `type` and an HTTP `status`. */
interface BodyParserError {
  type?: string;
  status?: number;
}

/**
 * Central error handler (registered last). Maps domain `AppError`s to their
 * status, headers and `{ error }` body; malformed JSON bodies to a 400;
 * anything else is an unexpected 500 and gets logged.
 */
export function error_handler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).set(err.headers).json({ error: err.message });
    return;
  }

  const parser_error = err as BodyParserError;
  if (parser_error?.type === "entity.parse.failed") {
    res.status(400).json({ error: "request body must be valid JSON" });
    return;
  }
  if (parser_error?.type && parser_error.status && parser_error.status < 500) {
    res.status(parser_error.status).json({ error: "request body could not be read" });
    return;
  }

  console.error("[unhandled error]", err);
  res.status(500).json({ error: "Internal server error" });
}

export function not_found_handler(_req: Request, res: Response): void {
  res.status(404).json({ error: "not found" });
}
