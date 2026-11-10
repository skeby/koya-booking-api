import cors from "cors";
import express, { type Express } from "express";
import { optional_env, require_env } from "./lib/env.js";
import { ensure_db } from "./middleware/ensure-db.js";
import { error_handler, not_found_handler } from "./middleware/error-handler.js";
import { require_api_key } from "./middleware/require-api-key.js";
import { bookings_router } from "./routes/bookings.js";
import { slots_router } from "./routes/slots.js";

export function create_app(api_key = require_env("API_KEY")): Express {
  const app = express();
  app.disable("x-powered-by");

  // CORS_ORIGIN is a comma-separated allowlist; unset means any origin.
  // Preflight requests are answered here, before the API key check, because
  // browsers never attach custom headers to them.
  const cors_origin = optional_env("CORS_ORIGIN", "*");
  app.use(
    cors({
      origin: cors_origin === "*" ? true : cors_origin.split(",").map((origin) => origin.trim()),
      allowedHeaders: ["Content-Type", "X-API-Key", "Idempotency-Key"],
      exposedHeaders: ["Retry-After"],
    }),
  );

  // Every request needs the key, including unknown routes. It runs before
  // the JSON parser so unauthenticated bodies are never parsed.
  app.use(require_api_key(api_key));
  app.use(express.json({ limit: "1mb" }));
  app.use(ensure_db);

  app.use("/", slots_router);
  app.use("/bookings", bookings_router);

  app.use(not_found_handler);
  app.use(error_handler);

  return app;
}
