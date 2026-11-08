import type { Config } from "./config.ts";
import type { Db } from "./db.ts";

/** Everything a route or service needs, injected so tests can swap the database. */
export type Deps = { db: Db; config: Config };

/** Set by `requireAuth` on `res.locals.auth`. */
export type AuthContext = {
  sessionId: string;
  userId: string;
  cafeId: string;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      auth?: AuthContext;
    }
  }
}
