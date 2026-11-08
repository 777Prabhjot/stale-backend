# Slate API

Express 5 + Prisma 7 + PostgreSQL. Serves the Slate frontend under `/api`.

## Run locally

Needs Node 20.19+ and a PostgreSQL server.

```bash
cp .env.example .env          # then set DATABASE_URL / TEST_DATABASE_URL
npm install                   # also generates the Prisma client
npm run db:deploy             # create the tables
npm run db:seed               # demo café "Cafe Bites" (sign in: 9876543210 / demo1234)
npm run dev                   # http://localhost:4000/api/health
```

The frontend forwards `/api/*` to this server (see `frontend/next.config.ts`), so run both and
open http://localhost:3000.

## Deploy: Vercel (API) + Neon (Postgres)

The API runs as one Vercel function: `npm run build` bundles `src/vercel.ts` into
`dist/vercel.mjs`, `api/index.js` serves it, and `vercel.json` routes every path there.
This folder deploys on its own; the shared schemas live in `src/shared` (copied from the
frontend by `npm run sync:shared`; the build fails if they're out of date).

1. **Database tables** (from your PC, once per schema change). In cmd, quote the URLs — they contain `&`:
   ```cmd
   set "DIRECT_URL=postgresql://…neon.tech/neondb?sslmode=require&channel_binding=require"
   npm run db:deploy
   ```
2. **Project + settings** (first time):
   ```cmd
   npx vercel link
   npx vercel env add DATABASE_URL production     (Neon *pooled* URL, with -pooler)
   npx vercel env add TRUST_PROXY production      (1)
   npx vercel --prod
   ```
3. Check `https://<your-api>.vercel.app/api/health` → `{"status":"ok"}`.
4. In the **frontend** Vercel project set `BACKEND_URL=https://<your-api>.vercel.app` and redeploy.

Don't seed the demo café in production: its password is public in this repo.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | API with reload on save |
| `npm run build` / `npm start` | Bundle to `dist/` / run the bundle on any Node host |
| `npm run sync:shared` | Copy the shared schemas from `../frontend/src/lib` into `src/shared` |
| `npm test` | Integration tests against `TEST_DATABASE_URL` (wiped on every test) |
| `npm run typecheck` | TypeScript check |
| `npm run db:migrate -- --name <change>` | After editing `prisma/schema.prisma`: new migration + client |
| `npm run db:deploy` | Apply existing migrations (fresh database, CI, production) |
| `npm run db:seed` / `db:seed:reset` | Create / recreate the demo café |
| `npm run db:studio` | Browse the database |

## API

All responses are JSON. Errors always look like
`{ "error": { "code", "message", "fieldErrors"? } }` with codes `VALIDATION` (400),
`UNAUTHORIZED` (401), `NOT_FOUND` (404), `CONFLICT` (409), `RATE_LIMITED` (429), `UNKNOWN` (500).
`fieldErrors` keys match form field names, so the frontend shows them under the right input.

| Method | Path | Auth | Body → Response |
| --- | --- | --- | --- |
| GET | `/api/health` | – | `{ status }` (also checks the database) |
| POST | `/api/auth/register` | – | register form → `{ user, cafe }` + session cookie |
| POST | `/api/auth/login` | – | `{ phone, password }` → `{ user, cafe }` + session cookie |
| POST | `/api/auth/logout` | – | → 204, clears the session |
| GET | `/api/auth/me` | ✓ | → `{ user, cafe }` |
| GET / PATCH | `/api/cafe` | ✓ | café profile → `{ cafe }` |
| POST | `/api/sections` | ✓ | `{ name, note, icon?, sizes[] }` → `{ cafe, section }` |
| PUT | `/api/sections/:id` | ✓ | same → `{ cafe, section }` (prices follow size changes) |
| DELETE | `/api/sections/:id` | ✓ | → `{ cafe }`; 409 if it still has dishes |
| POST | `/api/sections/:id/move` | ✓ | `{ direction: "up" \| "down" }` → `{ cafe }` |
| GET / POST | `/api/items` | ✓ | → `{ items }` / dish → `{ item }` |
| GET / PUT / DELETE | `/api/items/:id` | ✓ | → `{ item }` / dish → `{ item }` / 204 |
| PATCH | `/api/items/:id/availability` | ✓ | `{ isAvailable }` → `{ item }` |
| POST | `/api/items/:id/move` | ✓ | `{ direction }` → `{ items }` |
| GET | `/api/public/menus/:slug` | – | → `{ cafe, items }` (what diners see) |

Request bodies are validated with the **same Zod schemas the frontend forms use**
(`frontend/src/lib/schemas`, imported here as `@shared/*`), so a rule changes in one place.

## How it's put together

```
prisma/schema.prisma      Tables: users, sessions, cafes, sections, section_sizes, items, item_prices
prisma/migrations/        SQL migrations (commit these)
src/
  app.ts                  Express app: security headers, JSON, cookies, routers, error handler
  server.ts               Starts the server, graceful shutdown
  config.ts               Environment variables, validated at startup
  db.ts                   Prisma client (pg driver adapter)
  middleware/             requireAuth (session cookie → owner), error handler
  modules/<area>/         *.routes.ts (HTTP) + *.service.ts (rules and queries)
  modules/menu/serializers.ts   Rows → the JSON the frontend expects; internal fields never leave
  seed/demo.ts            Demo café data
tests/                    Supertest integration tests on a real Postgres database
```

**Security**
- Passwords: scrypt (Node built-in) with a per-user salt.
- Sessions: random token in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production). Only
  its SHA-256 is stored, so a database leak can't be used to sign in. 30 days, renewed while in use.
- Sign-in protection: 5 wrong passwords lock the account for 15 minutes, plus a per-IP limit.
  Unknown numbers and wrong passwords get the same answer, in the same time.
- Every owner query is scoped to the signed-in owner's café; other cafés' ids return 404
  (covered by tests).
- `helmet` security headers; owner responses are `Cache-Control: no-store`.
