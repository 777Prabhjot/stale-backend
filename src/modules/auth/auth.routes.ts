import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { AppError } from "@shared/errors";
import { SESSION_COOKIE, sessionCookieOptions } from "../../lib/sessions.ts";
import { authOf, requireAuth } from "../../middleware/require-auth.ts";
import type { Deps } from "../../types.ts";
import * as auth from "./auth.service.ts";

export function authRouter(deps: Deps): Router {
  const router = Router();

  // Per-IP brake on guessing; the per-account lockout in the service covers slow, spread-out attempts.
  const limiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: deps.config.authRateLimit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new AppError("RATE_LIMITED", "Too many attempts from this device. Try again in 15 minutes.")),
  });

  router.post("/register", limiter, async (req, res) => {
    const { user, cafe, session } = await auth.register(deps, req.body);
    res.cookie(SESSION_COOKIE, session.token, sessionCookieOptions(deps.config, session.expiresAt));
    res.status(201).json({ user, cafe });
  });

  router.post("/login", limiter, async (req, res) => {
    const { user, cafe, session } = await auth.login(deps, req.body);
    res.cookie(SESSION_COOKIE, session.token, sessionCookieOptions(deps.config, session.expiresAt));
    res.json({ user, cafe });
  });

  router.post("/logout", async (req, res) => {
    await auth.logout(deps, req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.status(204).end();
  });

  router.get("/me", requireAuth(deps), async (_req, res) => {
    res.json(await auth.getMe(deps, authOf(res)));
  });

  return router;
}
