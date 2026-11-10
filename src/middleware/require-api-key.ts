import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "../lib/errors.js";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Level 2: every request must carry the API key in `X-API-Key`. Comparing
 * fixed-length digests in constant time avoids leaking the key through
 * response timing.
 */
export function require_api_key(api_key: string) {
  const expected = digest(api_key);
  return (req: Request, _res: Response, next: NextFunction): void => {
    const provided = req.get("x-api-key");
    if (!provided || !timingSafeEqual(digest(provided), expected)) {
      next(new UnauthorizedError());
      return;
    }
    next();
  };
}
