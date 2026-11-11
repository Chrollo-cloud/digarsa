import { randomUUID } from "node:crypto";
import type { Express } from "express";
import { HttpError } from "./http.js";

const KTP_MIME_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);

function storageConfig(bucketName: string) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const bucket = process.env[bucketName];
  if (!url || !serviceKey || !bucket) {
    throw new HttpError(503, "STORAGE_NOT_CONFIGURED", "Penyimpanan dokumen belum dikonfigurasi.");
  }
  return { baseUrl: url.replace(/\/$/, ""), serviceKey, bucket };
}

export function makeKtpUploadPath(userId: string, file: Express.Multer.File) {
  if (!KTP_MIME_TYPES.has(file.mimetype) || file.size > 5 * 1024 * 1024) {
    throw new HttpError(400, "INVALID_KTP_FILE", "KTP harus berupa JPG, PNG, atau PDF dengan ukuran maksimal 5 MB.");
  }
  const validSignature = file.mimetype === "image/jpeg"
    ? file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff
    : file.mimetype === "image/png"
      ? file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : file.buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (!validSignature) throw new HttpError(400, "INVALID_KTP_FILE", "Isi berkas tidak cocok dengan tipe dokumen yang dipilih.");
  const extension = file.mimetype === "image/jpeg" ? "jpg" : file.mimetype === "image/png" ? "png" : "pdf";
  return `${userId}/${randomUUID()}.${extension}`;
}

function encodedPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

export async function uploadPrivateKtp(path: string, file: Express.Multer.File) {
  const { baseUrl, serviceKey, bucket } = storageConfig("SUPABASE_BUCKET_KTP");
  const response = await fetch(`${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath(path)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": file.mimetype,
      "x-upsert": "false",
    },
    body: file.buffer as unknown as BodyInit,
  });
  if (!response.ok) {
    throw new HttpError(502, "STORAGE_UPLOAD_FAILED", "Dokumen KTP gagal diunggah.");
  }
}

export async function removePrivateKtp(path: string) {
  const { baseUrl, serviceKey, bucket } = storageConfig("SUPABASE_BUCKET_KTP");
  await fetch(`${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath(path)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
  });
}

export async function createPrivateKtpSignedUrl(path: string) {
  const { baseUrl, serviceKey, bucket } = storageConfig("SUPABASE_BUCKET_KTP");
  const response = await fetch(`${baseUrl}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodedPath(path)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: 300 }),
  });
  if (!response.ok) throw new HttpError(502, "SIGNED_URL_FAILED", "Dokumen KTP tidak dapat dibuka saat ini.");
  const result = await response.json() as { signedURL?: string };
  if (!result.signedURL) throw new HttpError(502, "SIGNED_URL_FAILED", "Tautan dokumen tidak tersedia.");
  return result.signedURL.startsWith("http") ? result.signedURL : `${baseUrl}/storage/v1${result.signedURL}`;
}

export function makeCancellationEvidencePath(userId: string, file: Express.Multer.File) {
  if (!KTP_MIME_TYPES.has(file.mimetype) || file.size > 5 * 1024 * 1024) {
    throw new HttpError(400, "INVALID_EVIDENCE_FILE", "Bukti harus berupa JPG, PNG, atau PDF maksimal 5 MB.");
  }
  const validSignature = file.mimetype === "image/jpeg"
    ? file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff
    : file.mimetype === "image/png"
      ? file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : file.buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (!validSignature) throw new HttpError(400, "INVALID_EVIDENCE_FILE", "Isi bukti tidak cocok dengan tipe berkas yang dipilih.");
  const extension = file.mimetype === "image/jpeg" ? "jpg" : file.mimetype === "image/png" ? "png" : "pdf";
  return `${userId}/${randomUUID()}.${extension}`;
}

async function privateObjectRequest(path: string, action: "upload" | "remove" | "sign", file?: Express.Multer.File) {
  const { baseUrl, serviceKey, bucket } = storageConfig("SUPABASE_BUCKET_CANCELLATION_EVIDENCE");
  const endpoint = action === "sign" ? "sign" : "object";
  const url = `${baseUrl}/storage/v1/${endpoint}/${encodeURIComponent(bucket)}/${encodedPath(path)}`;
  const response = await fetch(url, {
    method: action === "upload" ? "POST" : action === "remove" ? "DELETE" : "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      ...(action === "upload" && file ? { "Content-Type": file.mimetype, "x-upsert": "false" } : {}),
      ...(action === "sign" ? { "Content-Type": "application/json" } : {}),
    },
    ...(action === "upload" && file ? { body: file.buffer as unknown as BodyInit } : {}),
    ...(action === "sign" ? { body: JSON.stringify({ expiresIn: 300 }) } : {}),
  });
  if (!response.ok) {
    throw new HttpError(502, action === "sign" ? "SIGNED_URL_FAILED" : "EVIDENCE_STORAGE_FAILED", "Bukti pembatalan tidak dapat diproses saat ini.");
  }
  if (action === "sign") {
    const result = await response.json() as { signedURL?: string };
    if (!result.signedURL) throw new HttpError(502, "SIGNED_URL_FAILED", "Tautan bukti tidak tersedia.");
    return result.signedURL.startsWith("http") ? result.signedURL : `${baseUrl}/storage/v1${result.signedURL}`;
  }
}

export async function uploadCancellationEvidence(path: string, file: Express.Multer.File) {
  await privateObjectRequest(path, "upload", file);
}

export async function removeCancellationEvidence(path: string) {
  await privateObjectRequest(path, "remove");
}

export async function createCancellationEvidenceSignedUrl(path: string) {
  return await privateObjectRequest(path, "sign") as string;
}
