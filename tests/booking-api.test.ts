import request from "supertest";
import type { Express } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { disconnect_db } from "../src/lib/db.js";
import { Booking } from "../src/models/index.js";
import { api, setup_app, SLOTS } from "./helpers.js";

let app: Express;
let client: ReturnType<typeof api>;

beforeAll(async () => {
  app = await setup_app();
  client = api(app);
});

afterAll(async () => {
  await disconnect_db();
});

beforeEach(async () => {
  const res = await client.reset();
  expect(res.status).toBe(200);
});

const book = (body: object, headers?: Record<string, string>) => client.post("/bookings", body, headers);
const ada = { slot_id: "s1", name: "Ada Obi", email: "ada@example.com" };

describe("level 1: slots and bookings", () => {
  it("lists every slot earliest first with availability", async () => {
    const res = await client.get("/slots");
    expect(res.status).toBe(200);
    expect(res.body.slots.map((slot: { id: string }) => slot.id)).toEqual(["past", "s1", "s2", "s4", "s5", "s6", "s3"]);
    expect(res.body.slots[1]).toEqual({ ...SLOTS[1], available: true });
  });

  it("filters slots by exact provider", async () => {
    const res = await client.get("/slots?provider=Dr%20Bello");
    expect(res.body.slots.map((slot: { id: string }) => slot.id)).toEqual(["s4", "s3"]);
    expect((await client.get("/slots?provider=dr%20bello")).body.slots).toEqual([]);
  });

  it("books a slot and looks the booking up", async () => {
    const created = await book(ada);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ ...ada, status: "confirmed" });
    expect(typeof created.body.id).toBe("string");
    expect(Number.isNaN(Date.parse(created.body.created_at))).toBe(false);

    const fetched = await client.get(`/bookings/${created.body.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(created.body);

    const slots = await client.get("/slots");
    expect(slots.body.slots.find((slot: { id: string }) => slot.id === "s1").available).toBe(false);
  });

  it("returns 404 for an unknown booking", async () => {
    for (const id of ["nope", "64b7f0000000000000000000"]) {
      const res = await client.get(`/bookings/${id}`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: expect.any(String) });
    }
  });

  it("reset deletes bookings and replaces slots", async () => {
    const created = await book(ada);
    await client.reset([{ id: "x1", provider: "Dr C", start: SLOTS[1]!.start, end: SLOTS[1]!.end }]);
    expect((await client.get(`/bookings/${created.body.id}`)).status).toBe(404);
    expect((await client.get("/slots")).body.slots).toHaveLength(1);
  });
});

describe("level 2: API key and validation", () => {
  it("rejects a missing or wrong API key on every route", async () => {
    for (const test of [
      request(app).get("/slots"),
      request(app).get("/slots").set("X-API-Key", "wrong"),
      request(app).post("/bookings").send(ada),
      request(app).post("/reset").send({ slots: [] }),
      request(app).get("/bookings/abc"),
      request(app).get("/unknown"),
    ]) {
      const res = await test;
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: expect.any(String) });
    }
  });

  it.each([
    ["missing slot_id", { name: "Ada", email: "ada@example.com" }],
    ["missing name", { slot_id: "s1", email: "ada@example.com" }],
    ["missing email", { slot_id: "s1", name: "Ada" }],
    ["empty name", { slot_id: "s1", name: "   ", email: "ada@example.com" }],
    ["empty slot_id", { slot_id: "", name: "Ada", email: "ada@example.com" }],
    ["invalid email", { slot_id: "s1", name: "Ada", email: "not-an-email" }],
    ["email without domain dot", { slot_id: "s1", name: "Ada", email: "ada@example" }],
    ["non-string name", { slot_id: "s1", name: 42, email: "ada@example.com" }],
  ])("returns 400 for %s", async (_label, body) => {
    const res = await book(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: expect.any(String) });
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await client.post("/bookings").set("Content-Type", "application/json").send("{bad");
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown slot and 400 for a slot that has started", async () => {
    expect((await book({ ...ada, slot_id: "missing" })).status).toBe(404);
    const started = await book({ ...ada, slot_id: "past" });
    expect(started.status).toBe(400);
    expect(started.body.error).toMatch(/started/);
  });

  it("trims name and email and stores email in lower case", async () => {
    const res = await book({ slot_id: "s1", name: "  Ada Obi ", email: "  Ada@Example.COM " });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Ada Obi", email: "ada@example.com" });
  });
});

describe("level 3: no double booking, cancellation", () => {
  it("lets exactly one of many simultaneous requests book a slot", async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) => book({ slot_id: "s2", name: `Patient ${i}`, email: `p${i}@example.com` })),
    );
    const statuses = results.map((res) => res.status);
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(24);
    expect(await Booking.countDocuments({ slot_id: "s2", status: "confirmed" })).toBe(1);
  });

  it("returns 409 when the slot already has a confirmed booking", async () => {
    await book(ada);
    const res = await book({ ...ada, email: "other@example.com" });
    expect(res.status).toBe(409);
  });

  it("cancels a booking, frees the slot and refuses a second cancel", async () => {
    const created = await book(ada);
    const cancelled = await client.delete(`/bookings/${created.body.id}`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toEqual({ ...created.body, status: "cancelled" });

    const slots = await client.get("/slots");
    expect(slots.body.slots.find((slot: { id: string }) => slot.id === "s1").available).toBe(true);

    expect((await client.delete(`/bookings/${created.body.id}`)).status).toBe(409);
    expect((await client.get(`/bookings/${created.body.id}`)).body.status).toBe("cancelled");

    const rebooked = await book({ ...ada, email: "next@example.com" });
    expect(rebooked.status).toBe(201);
  });

  it("returns 404 when cancelling an unknown booking", async () => {
    expect((await client.delete("/bookings/64b7f0000000000000000000")).status).toBe(404);
    expect((await client.delete("/bookings/nope")).status).toBe(404);
  });

  it("lets only one of two simultaneous cancels succeed", async () => {
    const created = await book(ada);
    const results = await Promise.all([1, 2, 3].map(() => client.delete(`/bookings/${created.body.id}`)));
    expect(results.map((res) => res.status).sort()).toEqual([200, 409, 409]);
  });
});

describe("level 4: idempotency and pagination", () => {
  it("replays the same response for the same key and body", async () => {
    const headers = { "Idempotency-Key": "key-1" };
    const first = await book(ada, headers);
    const second = await book(ada, headers);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(await Booking.countDocuments({})).toBe(1);
  });

  it("treats a reordered but identical body as the same request", async () => {
    const headers = { "Idempotency-Key": "key-order" };
    const first = await book({ slot_id: "s1", name: "Ada Obi", email: "ada@example.com" }, headers);
    const second = await book({ email: "ada@example.com", name: "Ada Obi", slot_id: "s1" }, headers);
    expect(second.body.id).toBe(first.body.id);
  });

  it("never creates a duplicate when retries arrive at the same moment", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => book(ada, { "Idempotency-Key": "key-race" })));
    expect(results.map((res) => res.status)).toEqual([201, 201, 201, 201, 201]);
    expect(new Set(results.map((res) => res.body.id)).size).toBe(1);
    expect(await Booking.countDocuments({})).toBe(1);
  });

  it("returns 422 when the key is reused with a different body", async () => {
    await book(ada, { "Idempotency-Key": "key-2" });
    const res = await book({ ...ada, slot_id: "s2" }, { "Idempotency-Key": "key-2" });
    expect(res.status).toBe(422);
    expect(await Booking.countDocuments({})).toBe(1);
  });

  it("replays a failed response too (same status)", async () => {
    await book({ ...ada, email: "first@example.com" });
    const headers = { "Idempotency-Key": "key-3" };
    const first = await book(ada, headers);
    const second = await book(ada, headers);
    expect(first.status).toBe(409);
    expect(second.status).toBe(409);
    expect(second.body).toEqual(first.body);
  });

  it("pages through a person's bookings oldest first, ignoring email case", async () => {
    const ids: string[] = [];
    for (const slot_id of ["s3", "s1", "s2", "s4", "s5"]) {
      ids.push((await book({ slot_id, name: "Ada", email: "ada@example.com" })).body.id);
    }
    await book({ slot_id: "s6", name: "Someone", email: "else@example.com" });

    const seen: string[] = [];
    let cursor: string | null = null;
    const sizes: number[] = [];
    do {
      const query: string = `/bookings?email=ADA@Example.com&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = await client.get(query);
      expect(res.status).toBe(200);
      sizes.push(res.body.bookings.length);
      seen.push(...res.body.bookings.map((booking: { id: string }) => booking.id));
      cursor = res.body.next_cursor;
    } while (cursor);

    expect(sizes).toEqual([2, 2, 1]);
    expect(seen).toEqual(ids);
  });

  it("defaults to 10 per page and returns null next_cursor on the last page", async () => {
    await book(ada);
    const res = await client.get("/bookings?email=ada@example.com");
    expect(res.body.bookings).toHaveLength(1);
    expect(res.body.next_cursor).toBeNull();
  });

  it.each(["0", "51", "abc", "1.5", "-1", ""])("returns 400 for limit=%s", async (limit) => {
    expect((await client.get(`/bookings?email=ada@example.com&limit=${limit}`)).status).toBe(400);
  });

  it("accepts limit 1 and 50, rejects a bad cursor and a missing email", async () => {
    expect((await client.get("/bookings?email=ada@example.com&limit=1")).status).toBe(200);
    expect((await client.get("/bookings?email=ada@example.com&limit=50")).status).toBe(200);
    expect((await client.get("/bookings?email=ada@example.com&cursor=garbage")).status).toBe(400);
    expect((await client.get("/bookings")).status).toBe(400);
  });
});

describe("level 5: rate limiting", () => {
  it("allows 5 attempts per email per minute, failed ones included, then 429", async () => {
    const statuses: number[] = [];
    for (const slot_id of ["s1", "missing", "past", "s1", "s2"]) {
      statuses.push((await book({ slot_id, name: "Ada", email: "ada@example.com" })).status);
    }
    expect(statuses).toEqual([201, 404, 400, 409, 201]);

    const limited = await book({ slot_id: "s4", name: "Ada", email: "ADA@example.com" });
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: expect.any(String) });
    const retry_after = Number(limited.headers["retry-after"]);
    expect(Number.isInteger(retry_after)).toBe(true);
    expect(retry_after).toBeGreaterThanOrEqual(1);
    expect(retry_after).toBeLessThanOrEqual(60);

    const other = await book({ slot_id: "s4", name: "Bo", email: "bo@example.com" });
    expect(other.status).toBe(201);
  });

  it("counts attempts with an invalid email too", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await book({ slot_id: "s1", name: "", email: "spam@example.com" })).status).toBe(400);
    }
    expect((await book({ slot_id: "s1", name: "x", email: "spam@example.com" })).status).toBe(429);
  });

  it("holds the limit under simultaneous attempts", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        book({ slot_id: `missing-${i}`, name: "Spam", email: "spam@example.com" }),
      ),
    );
    const statuses = results.map((res) => res.status);
    expect(statuses.filter((status) => status === 429)).toHaveLength(7);
    expect(statuses.filter((status) => status === 404)).toHaveLength(5);
  });
});
