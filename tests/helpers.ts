import request from "supertest";
import type { Express } from "express";
import { create_app } from "../src/create-app.js";
import { connect_db } from "../src/lib/db.js";

export const API_KEY = "test-key";
export const TEST_DB_URI =
  process.env.MONGODB_URI_TEST ?? "mongodb://127.0.0.1:27017/koya_booking_test?replicaSet=rs0";

export async function setup_app(): Promise<Express> {
  await connect_db(TEST_DB_URI);
  return create_app(API_KEY);
}

const in_hours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString().replace(".000", "");

export const SLOTS = [
  { id: "s3", provider: "Dr Bello", start: in_hours(50), end: in_hours(50.5) },
  { id: "s1", provider: "Dr Ade", start: in_hours(24), end: in_hours(24.5) },
  { id: "s2", provider: "Dr Ade", start: in_hours(25), end: in_hours(25.5) },
  { id: "s4", provider: "Dr Bello", start: in_hours(26), end: in_hours(26.5) },
  { id: "s5", provider: "Dr Ade", start: in_hours(27), end: in_hours(27.5) },
  { id: "s6", provider: "Dr Ade", start: in_hours(28), end: in_hours(28.5) },
  { id: "past", provider: "Dr Ade", start: in_hours(-2), end: in_hours(-1.5) },
];

export function api(app: Express) {
  const auth = <T extends request.Test>(test: T) => test.set("X-API-Key", API_KEY);
  return {
    get: (path: string) => auth(request(app).get(path)),
    post: (path: string, body?: object, headers: Record<string, string> = {}) =>
      auth(request(app).post(path)).set(headers).send(body),
    delete: (path: string) => auth(request(app).delete(path)),
    reset: (slots = SLOTS) => auth(request(app).post("/reset")).send({ slots }),
  };
}
