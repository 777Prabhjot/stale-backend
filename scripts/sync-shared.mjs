/*
 * The Zod schemas and AppError type are written once, in the frontend, and copied here so the
 * API validates with exactly the same rules while still deploying on its own.
 *
 *   npm run sync:shared            copy frontend/src/lib/... → src/shared/...
 *   node scripts/sync-shared.mjs --check   fail if the copies are out of date (runs before tests)
 *
 * Edit the frontend files, never the copies.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "../frontend/src/lib");
const target = resolve(root, "src/shared");
const FILES = ["errors.ts", "schemas/auth.ts", "schemas/cafe.ts", "schemas/menu-item.ts"];

const header = (file) =>
  `// COPIED from frontend/src/lib/${file} by \`npm run sync:shared\`. Edit the frontend file, not this one.\n`;

const check = process.argv.includes("--check");

if (!existsSync(source)) {
  // Deployed from a backend-only checkout: nothing to compare against, use the committed copies.
  console.log("sync-shared: ../frontend not found, using committed copies in src/shared.");
  process.exit(0);
}

let stale = [];
for (const file of FILES) {
  const expected = header(file) + readFileSync(resolve(source, file), "utf8");
  const out = resolve(target, file);
  const current = existsSync(out) ? readFileSync(out, "utf8") : null;
  if (current === expected) continue;
  if (check) {
    stale.push(file);
  } else {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, expected);
    console.log(`sync-shared: updated src/shared/${file}`);
  }
}

if (check && stale.length) {
  console.error(
    `sync-shared: src/shared is out of date with the frontend (${stale.join(", ")}).\n` +
      "Run `npm run sync:shared` in backend/ and commit the result.",
  );
  process.exit(1);
}
if (!check && !stale.length) console.log("sync-shared: src/shared is up to date.");
