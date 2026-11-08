import type { RequestHandler, Response } from "express";
import { AppError } from "@shared/errors";
import { SESSION_COOKIE, sessionCookieOptions } from "../lib/sessions.ts";
import { resolveSession } from "../modules/auth/auth.service.ts";
import type { AuthContext, Deps } from "../types.ts";

const signedOut = () => new AppError("UNAUTHORIZED", "Your session has ended. Sign in again.");

/** Resolves the session cookie into `res.locals.auth`, or responds 401. */
export function requireAuth(deps: Deps): RequestHandler {
  return async (req, res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    // No cookie: answer straight away without touching the database.
    if (typeof token !== "string" || !token) return next(signedOut());

    const session = await resolveSession(deps, token);
    if (!session) {
      res.clearCookie(SESSION_COOKIE, { path: "/" });
      return next(signedOut());
    }
    if (session.renewedSession) {
      res.cookie(SESSION_COOKIE, session.renewedSession.token, sessionCookieOptions(deps.config, session.renewedSession.expiresAt));
    }
    res.locals.auth = { sessionId: session.sessionId, userId: session.userId, cafeId: session.cafeId };
    next();
  };
}

/** For handlers behind `requireAuth`. */
export function authOf(res: Response): AuthContext {
  if (!res.locals.auth) throw signedOut();
  return res.locals.auth;
}
