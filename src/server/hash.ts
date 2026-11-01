import crypto from "node:crypto";

/** Password hashing shared by the app and the Windows setup tool. PBKDF2-SHA256, 310k rounds. */
const ITER = 310_000;
export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(pw, salt, ITER, 32, "sha256");
  return `pbkdf2-sha256$${ITER}$${salt.toString("base64")}$${key.toString("base64")}`;
}
export function checkPassword(pw: string, stored: string): boolean {
  const [alg, iter, salt, key] = stored.split("$");
  if (alg !== "pbkdf2-sha256" || !salt || !key) return false;
  const want = Buffer.from(key, "base64");
  const got = crypto.pbkdf2Sync(pw, Buffer.from(salt, "base64"), Number(iter), want.length, "sha256");
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
