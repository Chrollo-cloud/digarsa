import "dotenv/config";

import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL belum ditemukan di .env");
}

// Hapus parameter SSL dari URL agar tidak menimpa konfigurasi SSL.
const connectionUrl = new URL(databaseUrl);

for (const parameter of [
  "sslmode",
  "sslrootcert",
  "sslcert",
  "sslkey",
]) {
  connectionUrl.searchParams.delete(parameter);
}

// Membaca sertifikat Supabase.
const ca = readFileSync(
  new URL("../../certs/prod-ca-2021.crt", import.meta.url),
  "utf8"
);

// Membuat adapter PostgreSQL.
const adapter = new PrismaPg({
  connectionString: connectionUrl.toString(),

  ssl: {
    ca,
    rejectUnauthorized: true,
  },

  connectionTimeoutMillis: 10000,
});

// Membuat Prisma Client.
export const prisma = new PrismaClient({
  adapter,
});