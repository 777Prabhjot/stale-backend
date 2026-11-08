import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/*
 * scrypt from Node's standard library (no native add-ons to install).
 * Stored format: scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>, so the cost can be raised later
 * without breaking existing hashes.
 */

const KEY_LENGTH = 64;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  const N = options.N ?? 16384;
  const r = options.r ?? BLOCK_SIZE;
  return new Promise((resolve, reject) => {
    // Node's default maxmem (32 MB) is exactly 128·N·r at N=32768; leave headroom.
    scrypt(password, salt, KEY_LENGTH, { ...options, maxmem: 256 * N * r }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string, cost: number): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, { N: cost, r: BLOCK_SIZE, p: PARALLELISM });
  return ["scrypt", cost, BLOCK_SIZE, PARALLELISM, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;

  const expected = Buffer.from(hashB64, "base64");
  const actual = await derive(password, Buffer.from(saltB64, "base64"), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
