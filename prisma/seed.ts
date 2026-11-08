/*
 * Seeds the demo café (Cafe Bites). Run with `npm run db:seed`; `npm run db:seed:reset` recreates it.
 * Safe to run repeatedly: an existing demo owner is left alone unless --reset is given.
 */
import "dotenv/config";
import { loadConfig } from "../src/config.ts";
import { createPrisma } from "../src/db.ts";
import { DEMO_OWNER, seedDemo } from "../src/seed/demo.ts";

const config = loadConfig();
const db = createPrisma(config.databaseUrl);
const reset = process.argv.includes("--reset");

try {
  const result = await seedDemo(db, { scryptCost: config.scryptCost, reset });
  console.log(
    result === "created"
      ? `Demo café ready at /m/${DEMO_OWNER.slug}. Sign in with ${DEMO_OWNER.phone.slice(3)} / ${DEMO_OWNER.password}.`
      : "Demo café already exists. Run `npm run db:seed:reset` to recreate it.",
  );
} finally {
  await db.$disconnect();
}
