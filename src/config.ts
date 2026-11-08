import { z } from "zod";

const isPowerOfTwo = (n: number) => n > 1 && (n & (n - 1)) === 0;

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (see .env.example)"),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  /** Express "trust proxy": which proxies may set X-Forwarded-For (used for rate limiting). */
  TRUST_PROXY: z.string().default("loopback"),
  SCRYPT_COST: z.coerce
    .number()
    .int()
    .refine(isPowerOfTwo, "SCRYPT_COST must be a power of 2")
    .default(16384),
  /** Sign-in/register attempts allowed per IP per 15 minutes. */
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(20),
});

export type Config = {
  env: "development" | "test" | "production";
  isProduction: boolean;
  port: number;
  databaseUrl: string;
  sessionTtlDays: number;
  trustProxy: boolean | number | string;
  scryptCost: number;
  authRateLimit: number;
};

function parseTrustProxy(value: string): Config["trustProxy"] {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value; // e.g. "loopback", "uniquelocal", or a comma-separated list of IPs
}

/** Reads and validates environment variables. Fails fast with a readable message. */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  const env = parsed.data;
  return {
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === "production",
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    sessionTtlDays: env.SESSION_TTL_DAYS,
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    scryptCost: env.SCRYPT_COST,
    authRateLimit: env.AUTH_RATE_LIMIT,
  };
}
