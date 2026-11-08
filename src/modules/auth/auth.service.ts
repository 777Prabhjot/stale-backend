import { AppError } from "@shared/errors";
import { loginSchema, registerSchema, type User as UserDto } from "@shared/schemas/auth";
import type { Cafe as CafeDto } from "@shared/schemas/cafe";
import { hashPassword, verifyPassword } from "../../lib/passwords.ts";
import { createSessionToken, hashSessionToken, sessionExpiry, shouldRenew } from "../../lib/sessions.ts";
import { parseInput } from "../../lib/validation.ts";
import type { AuthContext, Deps } from "../../types.ts";
import { cafeInclude, toCafeDto, toUserDto } from "../menu/serializers.ts";

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

export type SessionGrant = { token: string; expiresAt: Date };
export type AuthResult = { user: UserDto; cafe: CafeDto; session: SessionGrant };

async function startSession({ db, config }: Deps, userId: string): Promise<SessionGrant> {
  const token = createSessionToken();
  const expiresAt = sessionExpiry(config);
  await db.session.create({ data: { id: hashSessionToken(token), userId, expiresAt } });
  // Opportunistic cleanup so expired sessions don't pile up.
  await db.session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
  return { token, expiresAt };
}

/** Same cost as a real check, so "no such account" and "wrong password" take equally long. */
let dummyHash: Promise<string> | undefined;
async function burnPasswordCheck(password: string, cost: number) {
  dummyHash ??= hashPassword("not-a-real-password", cost);
  await verifyPassword(password, await dummyHash);
}

export async function register(deps: Deps, input: unknown): Promise<AuthResult> {
  const data = parseInput(registerSchema, input);
  const { db, config } = deps;

  const [phoneTaken, slugTaken] = await Promise.all([
    db.user.findUnique({ where: { phone: data.phone }, select: { id: true } }),
    db.cafe.findUnique({ where: { slug: data.slug }, select: { id: true } }),
  ]);
  const fieldErrors: Record<string, string> = {};
  if (phoneTaken) fieldErrors.phone = "An account with this mobile number already exists";
  if (slugTaken) fieldErrors.slug = "This menu link is taken. Try another.";
  if (Object.keys(fieldErrors).length) {
    throw new AppError("CONFLICT", "Some details are already in use.", { fieldErrors });
  }

  const passwordHash = await hashPassword(data.password, config.scryptCost);
  const user = await db.user.create({
    data: {
      name: data.ownerName,
      phone: data.phone,
      passwordHash,
      cafe: { create: { name: data.cafeName, slug: data.slug } },
    },
    include: { cafe: { include: cafeInclude } },
  });

  const session = await startSession(deps, user.id);
  return { user: toUserDto(user), cafe: toCafeDto(user.cafe!), session };
}

export async function login(deps: Deps, input: unknown): Promise<AuthResult> {
  const data = parseInput(loginSchema, input);
  const { db, config } = deps;
  const invalid = new AppError("UNAUTHORIZED", "That mobile number and password don't match.");

  const user = await db.user.findUnique({
    where: { phone: data.phone },
    include: { cafe: { include: cafeInclude } },
  });
  if (!user || !user.cafe) {
    await burnPasswordCheck(data.password, config.scryptCost);
    throw invalid;
  }

  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60_000);
    throw new AppError(
      "RATE_LIMITED",
      `Too many wrong attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
    );
  }

  if (!(await verifyPassword(data.password, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await db.user.update({
      where: { id: user.id },
      data: lock
        ? { failedLogins: 0, lockedUntil: new Date(now.getTime() + LOCKOUT_MINUTES * 60_000) }
        : { failedLogins: failed },
    });
    throw invalid;
  }

  if (user.failedLogins > 0 || user.lockedUntil) {
    await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  }

  const session = await startSession(deps, user.id);
  return { user: toUserDto(user), cafe: toCafeDto(user.cafe), session };
}

export async function logout({ db }: Deps, token: string | undefined): Promise<void> {
  if (!token) return;
  await db.session.deleteMany({ where: { id: hashSessionToken(token) } });
}

export type ResolvedSession = AuthContext & { renewedSession?: SessionGrant };

/** Looks up the cookie's session. Renews it (same token, new expiry) when it's past its half-life. */
export async function resolveSession(deps: Deps, token: string): Promise<ResolvedSession | null> {
  const { db, config } = deps;
  const id = hashSessionToken(token);
  const session = await db.session.findUnique({
    where: { id },
    include: { user: { select: { cafe: { select: { id: true } } } } },
  });
  const cafeId = session?.user.cafe?.id;
  if (!session || !cafeId) return null;

  const now = new Date();
  if (session.expiresAt <= now) {
    await db.session.delete({ where: { id } }).catch(() => undefined);
    return null;
  }

  const resolved: ResolvedSession = { sessionId: id, userId: session.userId, cafeId };
  if (shouldRenew(config, session.expiresAt, now)) {
    const expiresAt = sessionExpiry(config, now);
    await db.session.update({ where: { id }, data: { expiresAt } });
    resolved.renewedSession = { token, expiresAt };
  }
  return resolved;
}

export async function getMe({ db }: Deps, auth: AuthContext): Promise<{ user: UserDto; cafe: CafeDto }> {
  const user = await db.user.findUnique({
    where: { id: auth.userId },
    include: { cafe: { include: cafeInclude } },
  });
  if (!user?.cafe) throw new AppError("UNAUTHORIZED", "Your session has ended. Sign in again.");
  return { user: toUserDto(user), cafe: toCafeDto(user.cafe) };
}
