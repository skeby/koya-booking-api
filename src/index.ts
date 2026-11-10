/**
 * Vercel entrypoint: Vercel detects an Express app default-exported from
 * src/index.ts (the file itself must import express) and serves it as a
 * function. The booking app is mounted inside a bare outer app; the MongoDB
 * connection opens on the first request (see ensure_db) and is reused while
 * the instance lives. For a long-running server (local dev), see main.ts.
 */
import express from "express";
import { create_app } from "./create-app.js";

const app = express();
app.disable("x-powered-by");
app.use(create_app());

export default app;
