import { loadEnvFiles } from "../src/loadEnv.js";

loadEnvFiles();
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/auth/password.js";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@fryeislandgolf.local";
  const password = process.env.ADMIN_PASSWORD ?? "change-me-admin-password";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin already present (${email}), leaving password unchanged`);
    return;
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: { email, passwordHash, role: "ADMIN" },
  });

  console.log(`Seeded new admin user: ${email}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
