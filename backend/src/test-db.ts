import { prisma } from "./config/prisma.js";

try {
  const result = await prisma.$queryRaw`
    SELECT 1 AS result
  `;

  console.log("Prisma connection successful!");
  console.log("Query result:", result);

} catch (error) {
  console.error("Prisma connection failed:", error);
  process.exitCode = 1;

} finally {
  await prisma.$disconnect();
}