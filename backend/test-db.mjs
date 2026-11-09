import "dotenv/config";
import pg from "pg";
import { readFileSync } from "node:fs";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL belum ditemukan di .env");
}

// Hapus parameter SSL dari URL agar tidak menimpa konfigurasi SSL di bawah.
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
  new URL("./certs/prod-ca-2021.crt", import.meta.url),
  "utf8"
);

const client = new pg.Client({
  connectionString: connectionUrl.toString(),

  connectionTimeoutMillis: 10000,

  ssl: {
    ca,
    rejectUnauthorized: true,
  },
});

try {
  await client.connect();

  const result = await client.query("SELECT 1 AS result");

  console.log("Database connection successful!");
  console.log("Query result:", result.rows[0].result);
} catch (error) {
  console.error("Database connection failed.");
  console.error("Error code:", error.code ?? "Unknown");
  console.error("Message:", error.message);
} finally {
  await client.end().catch(() => {});
}