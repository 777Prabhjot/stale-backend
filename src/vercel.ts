/*
 * Vercel entry: the Express app as one serverless function (see api/index.js and vercel.json).
 * Built into dist/vercel.mjs by `npm run build`. Environment variables come from Vercel.
 */
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createPrisma } from "./db.ts";

const config = loadConfig();
// Created once per function instance and reused across requests.
const db = createPrisma(config.databaseUrl);

export default createApp({ db, config });
