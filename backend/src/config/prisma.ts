import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const isTestRuntime = process.env.NODE_ENV === "test";
let adapter: PrismaPg;

if (isTestRuntime) {
  const directTestUrl = process.env.DIRECT_URL_CONCURRENCY_TEST;
  if (!directTestUrl) {
    throw new Error("Isolated test runtime requires DIRECT_URL_CONCURRENCY_TEST.");
  }
  const target = new URL(directTestUrl);
  if (
    target.hostname.toLowerCase() !== "localhost"
    || (target.port || "5432") !== "5432"
    || decodeURIComponent(target.pathname.replace(/^\//, "")) !== "digarsa_concurrency_test"
    || decodeURIComponent(target.username) !== "digarsa_concurrency_test_user"
    || (target.searchParams.get("schema") || "public") !== "public"
  ) {
    throw new Error("Refusing to initialize Prisma outside the approved local disposable test database.");
  }
  adapter = new PrismaPg({ connectionString: directTestUrl, connectionTimeoutMillis: 5000 });
} else {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required by the Prisma runtime.");
  }

  const connectionUrl = new URL(databaseUrl);
  for (const parameter of ["sslmode", "sslrootcert", "sslcert", "sslkey"]) {
    connectionUrl.searchParams.delete(parameter);
  }

  // Membaca sertifikat Supabase.
  const ca = readFileSync(
    new URL("../../certs/prod-ca-2021.crt", import.meta.url),
    "utf8"
  );

  adapter = new PrismaPg({
    connectionString: connectionUrl.toString(),
    ssl: { ca, rejectUnauthorized: true },
    connectionTimeoutMillis: 10000,
  });
}

// Membuat Prisma Client.
export const prisma = new PrismaClient({
  adapter,
});
