import "dotenv/config";
import { prisma } from "../src/config/prisma.js";

const categories = [
  { name: "Branding", slug: "branding" },
  { name: "Fotografi & Film", slug: "fotografi-film" },
  { name: "Web & Digital", slug: "web-digital" },
  { name: "Illustration & Motion", slug: "illustration-motion" },
];

try {
  await prisma.$transaction(async (tx) => {
    for (const category of categories) {
      await tx.category.upsert({
        where: { slug: category.slug },
        update: {},
        create: category,
      });
    }
  }, { maxWait: 10_000, timeout: 30_000 });

  console.log("Category seed completed without updating existing categories.");
} finally {
  await prisma.$disconnect();
}
