/**
 * Fill a running API with demo slots through POST /reset (this deletes every
 * existing booking). Weekdays over the next two weeks, 09:00 to 16:00 Lagos
 * time, 30-minute slots, a few providers on different days.
 *
 *   API_URL=https://... API_KEY=... pnpm seed
 */
import "dotenv/config";

const API_URL = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
const API_KEY = process.env.API_KEY;
if (!API_KEY) throw new Error("Set API_KEY");

const PROVIDERS = [
  { name: "Dr Ade Bakare", days: [1, 3, 5] },
  { name: "Dr Ngozi Eze", days: [1, 2, 4] },
  { name: "Dr Tunde Lawal", days: [2, 3, 5] },
];
const LAGOS_UTC_OFFSET_HOURS = 1;

const slots: { id: string; provider: string; start: string; end: string }[] = [];
const today = new Date();

for (let offset = 1; offset <= 14; offset++) {
  const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset));
  const weekday = day.getUTCDay();

  for (const [index, provider] of PROVIDERS.entries()) {
    if (!provider.days.includes(weekday)) continue;
    for (let minutes = 9 * 60; minutes < 16 * 60; minutes += 30) {
      if (minutes === 12 * 60 || minutes === 12 * 60 + 30) continue; // lunch
      const start = new Date(day.getTime() + (minutes - LAGOS_UTC_OFFSET_HOURS * 60) * 60_000);
      const end = new Date(start.getTime() + 30 * 60_000);
      const iso = (date: Date) => date.toISOString().replace(".000Z", "Z");
      slots.push({
        id: `${iso(start).slice(0, 10)}-p${index + 1}-${String(minutes).padStart(4, "0")}`,
        provider: provider.name,
        start: iso(start),
        end: iso(end),
      });
    }
  }
}

const res = await fetch(`${API_URL}/reset`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-API-Key": API_KEY },
  body: JSON.stringify({ slots }),
});
console.log(res.status, await res.text());
