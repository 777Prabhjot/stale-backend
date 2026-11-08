import { createHash, randomBytes } from "node:crypto";
import type { CookieOptions } from "express";
import type { Config } from "../config.ts";

export const SESSION_COOKIE = "slate_session";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Random token for the cookie. Only its hash is stored, so a database leak can't be replayed. */
export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionExpiry(config: Config, from = new Date()): Date {
  return new Date(from.getTime() + config.sessionTtlDays * DAY_MS);
}

/** Renew when less than half the lifetime is left: active owners stay signed in, at most one write per half-life. */
export function shouldRenew(config: Config, expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() - now.getTime() < (config.sessionTtlDays * DAY_MS) / 2;
}

export function sessionCookieOptions(config: Config, expires: Date): CookieOptions {
  return {
    httpOnly: true,
    // Lax: sent on same-site requests and top-level navigation, never on cross-site POSTs (CSRF).
    sameSite: "lax",
    secure: config.isProduction,
    path: "/",
    expires,
  };
}
