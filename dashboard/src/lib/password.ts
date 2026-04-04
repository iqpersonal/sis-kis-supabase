import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/** Hash a plaintext password. */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** Returns true if `stored` is a bcrypt hash (starts with $2). */
export function isHashed(stored: string): boolean {
  return /^\$2[aby]?\$/.test(stored);
}

/**
 * Compare a plaintext password against a stored value.
 * Supports both bcrypt hashes and legacy plaintext.
 * Returns { match: boolean, needsUpgrade: boolean }.
 */
export async function verifyPassword(
  plaintext: string,
  stored: string
): Promise<{ match: boolean; needsUpgrade: boolean }> {
  if (isHashed(stored)) {
    const match = await bcrypt.compare(plaintext, stored);
    return { match, needsUpgrade: false };
  }
  // Legacy plaintext comparison
  const match = stored === plaintext;
  return { match, needsUpgrade: match };
}
