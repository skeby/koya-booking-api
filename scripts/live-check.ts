/**
 * Smoke-test a deployed API against all five levels. Calls /reset, so it
 * wipes the target's data; it reseeds demo slots at the end.
 *
 *   API_URL=https://... pnpm tsx scripts/live-check.ts   (API_KEY from env or .env.production)
 */
import dotenv from "dotenv";

dotenv.config({ path: process.env.ENV_FILE ?? ".env.production" });

const API_URL = (process.env.API_URL ?? "https://api.booking.koya.checkmeout.me").replace(/\/$/, "");
const API_KEY = process.env.API_KEY;
if (!API_KEY) throw new Error("API_KEY missing");

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};

const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, key: string | null = API_KEY) => {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(key ? { "X-API-Key": key } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body: json, headers: res.headers };
};

const iso = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z");
const slots = [
  { id: "s1", provider: "Dr Ade", start: iso(24), end: iso(24.5) },
  { id: "s2", provider: "Dr Ade", start: iso(25), end: iso(25.5) },
  { id: "s3", provider: "Dr Bello", start: iso(23), end: iso(23.5) },
  { id: "s4", provider: "Dr Bello", start: iso(26), end: iso(26.5) },
  { id: "s5", provider: "Dr Ade", start: iso(27), end: iso(27.5) },
  { id: "past", provider: "Dr Ade", start: iso(-3), end: iso(-2.5) },
];

const t0 = Date.now();
// Level 2: key
check("L2 no key -> 401", (await call("GET", "/slots", undefined, {}, null)).status === 401);
check("L2 wrong key -> 401", (await call("GET", "/slots", undefined, {}, "wrong")).status === 401);

// Level 1
const reset = await call("POST", "/reset", { slots });
check("L1 reset -> 200", reset.status === 200, JSON.stringify(reset.body));
const list = await call("GET", "/slots");
check("L1 slots sorted by start", JSON.stringify(list.body?.slots?.map((s: any) => s.id)) === JSON.stringify(["past", "s3", "s1", "s2", "s4", "s5"]));
check("L1 slot echoes start string", list.body?.slots?.[2]?.start === slots[0]!.start && list.body?.slots?.[2]?.available === true);
check("L1 provider filter", (await call("GET", "/slots?provider=Dr%20Bello")).body?.slots?.length === 2);
const created = await call("POST", "/bookings", { slot_id: "s1", name: "  Ada Obi ", email: " Ada@Example.com " });
check("L1 book -> 201 confirmed", created.status === 201 && created.body?.status === "confirmed", `${created.status}`);
check("L2 trims and lowercases", created.body?.name === "Ada Obi" && created.body?.email === "ada@example.com");
const fetched = await call("GET", `/bookings/${created.body?.id}`);
check("L1 get booking", fetched.status === 200 && fetched.body?.id === created.body?.id);
check("L1 unknown booking -> 404", (await call("GET", "/bookings/64b7f0000000000000000000")).status === 404);

// Level 2: validation (distinct emails so the rate limit doesn't interfere)
check("L2 missing name -> 400", (await call("POST", "/bookings", { slot_id: "s2", email: "v1@example.com" })).status === 400);
check("L2 invalid email -> 400", (await call("POST", "/bookings", { slot_id: "s2", name: "V", email: "nope" })).status === 400);
check("L2 unknown slot -> 404", (await call("POST", "/bookings", { slot_id: "zzz", name: "V", email: "v2@example.com" })).status === 404);
check("L2 started slot -> 400", (await call("POST", "/bookings", { slot_id: "past", name: "V", email: "v3@example.com" })).status === 400);

// Level 3: concurrency + cancel
const race = await Promise.all(Array.from({ length: 20 }, (_, i) =>
  call("POST", "/bookings", { slot_id: "s2", name: `P${i}`, email: `race${i}@example.com` })));
const wins = race.filter((r) => r.status === 201).length;
const conflicts = race.filter((r) => r.status === 409).length;
check("L3 20 simultaneous bookings -> one 201", wins === 1 && conflicts === 19, `201x${wins} 409x${conflicts} other=${race.filter((r) => ![201, 409].includes(r.status)).map((r) => r.status)}`);
const cancel = await call("DELETE", `/bookings/${created.body?.id}`);
check("L3 cancel -> 200 cancelled", cancel.status === 200 && cancel.body?.status === "cancelled");
check("L3 cancel again -> 409", (await call("DELETE", `/bookings/${created.body?.id}`)).status === 409);
check("L3 slot free again", (await call("GET", "/slots")).body?.slots?.find((s: any) => s.id === "s1")?.available === true);

// Level 4: idempotency
const body = { slot_id: "s3", name: "Idem", email: "idem@example.com" };
const idem = await Promise.all(Array.from({ length: 4 }, () => call("POST", "/bookings", body, { "Idempotency-Key": "live-key-1" })));
const ids = new Set(idem.map((r) => r.body?.id));
check("L4 4 simultaneous retries -> same 201 + id", idem.every((r) => r.status === 201) && ids.size === 1, idem.map((r) => r.status).join(","));
check("L4 same key, different body -> 422", (await call("POST", "/bookings", { ...body, slot_id: "s4" }, { "Idempotency-Key": "live-key-1" })).status === 422);

// Level 4: pagination
for (const slot_id of ["s4", "s5"]) await call("POST", "/bookings", { slot_id, name: "Idem", email: "idem@example.com" });
const p1 = await call("GET", "/bookings?email=IDEM@example.com&limit=2");
const p2 = await call("GET", `/bookings?email=idem@example.com&limit=2&cursor=${encodeURIComponent(p1.body?.next_cursor ?? "")}`);
check("L4 page 1 has 2 + cursor", p1.body?.bookings?.length === 2 && typeof p1.body?.next_cursor === "string");
check("L4 page 2 has 1 + null cursor", p2.body?.bookings?.length === 1 && p2.body?.next_cursor === null);
check("L4 limit=0 -> 400", (await call("GET", "/bookings?email=idem@example.com&limit=0")).status === 400);
check("L4 limit=51 -> 400", (await call("GET", "/bookings?email=idem@example.com&limit=51")).status === 400);

// Level 5: rate limit
const spam: number[] = [];
for (let i = 0; i < 6; i++) spam.push((await call("POST", "/bookings", { slot_id: "zzz", name: "S", email: "spam@example.com" })).status);
const limited = await call("POST", "/bookings", { slot_id: "zzz", name: "S", email: "spam@example.com" });
check("L5 first 5 counted (404), 6th -> 429", JSON.stringify(spam) === JSON.stringify([404, 404, 404, 404, 404, 429]), spam.join(","));
const retry = Number(limited.headers.get("retry-after"));
check("L5 Retry-After whole seconds", Number.isInteger(retry) && retry >= 1 && retry <= 60, `${retry}`);
check("L5 other email unaffected", (await call("POST", "/bookings", { slot_id: "zzz", name: "S", email: "other@example.com" })).status === 404);

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`} in ${((Date.now() - t0) / 1000).toFixed(1)}s against ${API_URL}`);
process.exitCode = failures ? 1 : 0;
