import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { HttpError } from "./http.js";

function encryptionKey() {
  const value = process.env.NIK_ENCRYPTION_KEY;
  if (!value) throw new HttpError(503, "ENCRYPTION_NOT_CONFIGURED", "Penyimpanan data verifikasi belum dikonfigurasi.");
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (key.length !== 32) throw new HttpError(500, "SERVER_CONFIG_ERROR", "NIK_ENCRYPTION_KEY harus berisi 32 byte.");
  return key;
}

export function encryptNik(nik: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(nik, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}

export function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
