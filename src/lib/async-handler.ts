import type { NextFunction, Request, Response } from "express";

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Wrap an async controller so rejected promises are forwarded to Express's
 * error middleware (Express 4 doesn't catch async errors on its own). Lets
 * controllers simply `throw` and stay free of try/catch boilerplate.
 */
export function async_handler(fn: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
