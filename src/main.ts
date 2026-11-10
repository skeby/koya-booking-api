import { create_app } from "./create-app.js";
import { connect_db } from "./lib/db.js";
import { optional_env } from "./lib/env.js";

async function main(): Promise<void> {
  await connect_db();

  const port = Number(optional_env("PORT", "4000"));
  create_app().listen(port, () => {
    console.log(`Booking API listening on http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
