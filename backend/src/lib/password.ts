import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";

function normalizedPassword(password: string) {
  return `sha256$${createHash("sha256").update(password, "utf8").digest("hex")}`;
}

export async function hashPassword(password: string) {
  return `v2$${await bcrypt.hash(normalizedPassword(password), 12)}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  if (storedHash.startsWith("v2$")) {
    return { matches: await bcrypt.compare(normalizedPassword(password), storedHash.slice(3)), needsRehash: false };
  }
  // One-time compatibility for accounts created by the earlier 72-byte bcrypt flow.
  if (!storedHash.startsWith("$2")) return { matches: false, needsRehash: false };
  const legacyMatch = await bcrypt.compare(password, storedHash);
  return { matches: legacyMatch, needsRehash: legacyMatch };
}
