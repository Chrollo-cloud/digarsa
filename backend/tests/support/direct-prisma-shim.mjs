import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client.ts";

const directUrl = process.env.DIRECT_URL_CONCURRENCY_TEST;
if (!directUrl) throw new Error("DIRECT_URL_CONCURRENCY_TEST is required for isolated integration tests");
const target = new URL(directUrl);
if (target.hostname.toLowerCase() !== "localhost" || (target.port || "5432") !== "5432" || decodeURIComponent(target.pathname.slice(1)) !== "digarsa_concurrency_test" || decodeURIComponent(target.username) !== "digarsa_concurrency_test_user" || (target.searchParams.get("schema") || "public") !== "public") {
  throw new Error("Refusing to initialize Prisma outside the approved local disposable target");
}

export function createDirectPrismaClient() {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: directUrl, connectionTimeoutMillis: 5000 }) });
}

export const prisma = createDirectPrismaClient();
