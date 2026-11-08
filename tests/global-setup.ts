import "dotenv/config";
import { execSync } from "node:child_process";

/** Applies migrations to the test database once before all test files. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example).");
  // Tests wipe every table; refuse anything that doesn't look like a throwaway database.
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error(`Refusing to run tests against "${new URL(url).pathname}": the database name must contain "test".`);
  }
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
