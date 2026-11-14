import "dotenv/config";
import { fileURLToPath } from "node:url";
import { defineConfig, env } from "prisma/config";

const directUrl = new URL(env("DIRECT_URL"));
directUrl.searchParams.set("sslmode", "require");
directUrl.searchParams.set(
  "sslcert",
  fileURLToPath(new URL("./certs/prod-ca-2021.crt", import.meta.url)),
);
directUrl.searchParams.set("sslaccept", "strict");

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },

  datasource: {
    url: directUrl.toString(),
  },
});
