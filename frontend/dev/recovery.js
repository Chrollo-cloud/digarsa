import { pbkdf2Sync, randomBytes } from "node:crypto";
import { validateNewPassword } from "../src/features/account/profileValidation.js";

// Offline tooling, never imported by Vite application entries. Possession of an
// explicit local backup + developer identity confirmation is required. This is
// not an authentication API or email-based proof of account ownership.
export function recoverLocalDemo(raw, { accountId, email, newPassword, confirmation, approved = false }) {
  if (!approved) throw new Error("Explicit local developer approval is required.");
  validateNewPassword(newPassword, confirmation);
  let db;
  try { db = JSON.parse(raw); } catch { throw new Error("Invalid backup; original data unchanged."); }
  if (db?.version !== 1 || !Array.isArray(db.accounts) || !Array.isArray(db.profiles) ||
      !db.accounts.every(row => row && typeof row.id === "string" && typeof row.email === "string" &&
        typeof row.salt === "string" && typeof row.passwordVerifier === "string" && Array.isArray(row.permissions)) ||
      new Set(db.accounts.map(row => row.id)).size !== db.accounts.length)
    throw new Error("Incompatible backup; original data unchanged.");
  const matches = db.accounts.filter(row => row.id === accountId && row.email === email?.trim().toLowerCase());
  if (matches.length !== 1) throw new Error("Target identity does not match the supplied backup.");
  const target = matches[0];
  if (target.permissions.includes("admin:access")) throw new Error("Admin recovery is excluded; use the existing internal provisioning workflow.");
  const salt = randomBytes(16).toString("hex");
  target.salt = salt;
  // Same PBKDF2 parameters and UTF-8 hex salt representation as demoStore.
  target.passwordVerifier = pbkdf2Sync(newPassword, salt, 100000, 32, "sha256").toString("hex");
  if (db.session?.userId === target.id) db.session = null;
  return JSON.stringify(db);
}
