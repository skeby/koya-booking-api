/**
 * Vercel entrypoint: Vercel detects an Express app default-exported from
 * src/index.ts and serves it as a function. The MongoDB connection opens on
 * the first request (see ensure_db) and is reused while the instance lives.
 * For a long-running server (local dev), see main.ts.
 */
import { create_app } from "./create-app.js";

export default create_app();
