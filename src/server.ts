import "dotenv/config";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createPrisma } from "./db.ts";

const config = loadConfig();
const db = createPrisma(config.databaseUrl);
const app = createApp({ db, config });

const server = app.listen(config.port, () => {
  console.log(`Slate API listening on http://localhost:${config.port}/api (${config.env})`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down…`);
  server.close(async () => {
    await db.$disconnect();
    process.exit(0);
  });
  // Don't hang forever on open keep-alive connections.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
