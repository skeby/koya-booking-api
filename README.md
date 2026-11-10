# Clinic booking API

Express + MongoDB API for booking clinic appointment slots, built for Task 1 of the Koya Academy assessment. It follows the contract at [koyaacademy.com/assessment-api](https://koyaacademy.com/assessment-api).

The booking page that uses it lives in [koya-booking-ui](https://github.com/skeby/koya-booking-ui).

## Endpoints

Every request needs the `X-API-Key` header. Every error is `{"error": "<message>"}`.

| Method | Path | What it does |
| --- | --- | --- |
| POST | `/reset` | Deletes every booking and replaces all slots |
| GET | `/slots?provider=` | All slots, earliest first, with `available` |
| POST | `/bookings` | Books a slot (optional `Idempotency-Key` header) |
| GET | `/bookings?email=&limit=&cursor=` | A person's bookings, oldest first, cursor paged |
| GET | `/bookings/:id` | One booking |
| DELETE | `/bookings/:id` | Cancels a booking and frees the slot |

## How each level is handled

**Level 1.** Slots store the exact `start`/`end` strings sent to `/reset` (so responses echo them back unchanged) plus parsed dates for sorting and time checks.

**Level 2.** `X-API-Key` is checked on every route, before the body is parsed, using a constant-time comparison. Bookings are validated with zod: `slot_id`, `name` and `email` must be non-empty after trimming, the email must look valid and is stored lower case. Unknown slot is 404, a slot that has started is 400.

**Level 3.** MongoDB enforces "one confirmed booking per slot" with a partial unique index on `slot_id` (filtered to `status: "confirmed"`). When many requests race for a slot, exactly one insert succeeds and the rest get a duplicate-key error, returned as 409. Cancelling sets the status to `cancelled`, which takes the booking out of the index and frees the slot. The cancel is a single conditional update, so two cancels can't both succeed.

**Level 4.** Idempotency keys are stored with a unique index. The first request to insert the key owns it and runs the booking; a retry or a duplicate sent at the same moment waits for the owner and replays the stored status and body. The request body is hashed (keys sorted), so the same key with a different body is a 422. A 429 or a server error releases the key, so a later retry runs again. Pagination uses an opaque cursor over `(created_at, _id)`, so pages stay stable while new bookings are added.

**Level 5.** A sliding window of attempt times per email, updated in one atomic MongoDB operation on the database clock. Every attempt with an email counts, including ones that fail validation or hit a taken slot. The 6th attempt within a minute gets 429 with `Retry-After` set to the whole seconds until the oldest attempt leaves the window. Idempotent replays don't count as new attempts.

State lives in MongoDB, not in memory, so all of this holds across serverless instances.

## Running locally

```bash
pnpm install
cp .env.example .env        # set API_KEY and MONGODB_URI
pnpm mongo:dev              # local MongoDB in Docker (optional if you use Atlas)
pnpm dev                    # http://localhost:4000
pnpm seed                   # demo slots for the next two weeks (calls /reset)
```

## Tests

```bash
pnpm mongo:dev
pnpm test
```

39 integration tests run against a real MongoDB and cover every level, including 25 simultaneous bookings for one slot, simultaneous idempotent retries and simultaneous attempts against the rate limit.

## Deployment

Deployed on Vercel (Express zero-config, entry `src/index.ts`) with MongoDB Atlas. Environment variables: `MONGODB_URI`, `API_KEY`, `CORS_ORIGIN`.
