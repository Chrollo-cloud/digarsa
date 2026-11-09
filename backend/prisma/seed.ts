import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/config/prisma.js";

const categories = [
  { name: "Branding", slug: "branding" },
  { name: "Fotografi & Film", slug: "fotografi-film" },
  { name: "Web & Digital", slug: "web-digital" },
  { name: "Illustration & Motion", slug: "illustration-motion" },
];

try {
  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, isActive: true },
      create: category,
    });
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    if (adminPassword.length < 12) {
      throw new Error("ADMIN_PASSWORD harus minimal 12 karakter.");
    }
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: { role: "ADMIN", accountStatus: "ACTIVE" },
      create: {
        email: adminEmail,
        name: process.env.ADMIN_NAME?.trim() || "Digarsa Admin",
        passwordHash,
        role: "ADMIN",
      },
    });
  } else if (adminEmail || adminPassword) {
    throw new Error("ADMIN_EMAIL dan ADMIN_PASSWORD harus disediakan bersama.");
  }

  console.log("Seed kategori selesai.");
} finally {
  await prisma.$disconnect();
}