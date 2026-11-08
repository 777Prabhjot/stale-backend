import request from "supertest";
import { afterAll, beforeEach } from "vitest";
import { createApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { createPrisma } from "../src/db.ts";

/** Builds the app on the test database and wipes all tables before each test. */
export function useTestApp() {
  const config = loadConfig({
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    SCRYPT_COST: "1024", // fast hashing; production uses 16384
    AUTH_RATE_LIMIT: "1000",
  });
  const db = createPrisma(config.databaseUrl);
  const app = createApp({ db, config });

  beforeEach(async () => {
    await db.$executeRawUnsafe(
      `TRUNCATE item_prices, items, section_sizes, sections, sessions, cafes, users RESTART IDENTITY CASCADE`,
    );
  });
  afterAll(async () => {
    await db.$disconnect();
  });

  /** A browser-like client that keeps cookies between requests. */
  const agent = () => request.agent(app);

  let counter = 0;
  /** Registers a fresh owner and returns a signed-in client plus their café. */
  async function owner(overrides: Partial<Record<string, string>> = {}) {
    counter += 1;
    const client = agent();
    const res = await client
      .post("/api/auth/register")
      .send({
        ownerName: "Test Owner",
        phone: `9${String(100000000 + counter).slice(-9)}`,
        password: "secret123",
        confirmPassword: "secret123",
        cafeName: `Cafe ${counter}`,
        slug: `cafe-${counter}`,
        ...overrides,
      });
    if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
    return { client, cafe: res.body.cafe, user: res.body.user };
  }

  return { app, db, config, agent, owner };
}

type Client = ReturnType<typeof request.agent>;

export async function createSection(client: Client, body: { name: string; sizes?: string[]; note?: string }) {
  const res = await client.post("/api/sections").send({
    name: body.name,
    note: body.note ?? "",
    sizes: (body.sizes ?? []).map((label) => ({ label })),
  });
  if (res.status !== 201) throw new Error(`section failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.section as { id: string; name: string; sizes: { id: string; label: string }[] };
}

export function dish(sectionId: string, prices: Record<string, number>, overrides: Record<string, unknown> = {}) {
  return {
    name: "Dish",
    description: "",
    sectionId,
    prices,
    discountType: "none",
    dietary: "veg",
    tag: "none",
    isAvailable: true,
    ...overrides,
  };
}
