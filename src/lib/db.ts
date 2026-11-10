import mongoose from "mongoose";
import { require_env } from "./env.js";
import { Booking, IdempotencyRecord, RateLimit, Slot } from "../models/index.js";

let connect_promise: Promise<typeof mongoose> | null = null;

/**
 * Connect to MongoDB once per process and reuse the connection. Indexes are
 * built explicitly (not in the background) before the first request is
 * served, because the booking guarantees depend on the unique indexes
 * existing: without them two racing bookings could both succeed.
 */
export function connect_db(uri = require_env("MONGODB_URI")): Promise<typeof mongoose> {
  if (!connect_promise) {
    mongoose.set("strictQuery", true);
    mongoose.set("autoIndex", false);
    connect_promise = mongoose
      .connect(uri, {
        maxPoolSize: 20,
        serverSelectionTimeoutMS: 10_000,
        socketTimeoutMS: 45_000,
      })
      .then(async (connection) => {
        await Promise.all([Slot, Booking, IdempotencyRecord, RateLimit].map((m) => m.createIndexes()));
        return connection;
      })
      .catch((err) => {
        // Let the next request retry instead of caching a failed connection.
        connect_promise = null;
        throw err;
      });
  }
  return connect_promise;
}

export async function disconnect_db(): Promise<void> {
  if (connect_promise) {
    connect_promise = null;
    await mongoose.disconnect();
  }
}
