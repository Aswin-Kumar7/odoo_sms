// Demo data. Safe to re-run: users are upserted by email.
// Demo logins (test values only — never real credentials):
//   admin    → SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (defaults: admin@brightloop.test / Admin@12345)
//   staff    → staff@brightloop.test / Staff@12345
//   customer → customer@brightloop.test / Customer@123
import "dotenv/config";
import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function upsertUser(email: string, password: string, name: string, role: Role, customerName?: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return prisma.user.update({ where: { email }, data: { passwordHash, name, role, isActive: true } });
  }
  return prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      role,
      ...(customerName ? { customer: { create: { name: customerName, email } } } : {}),
    },
  });
}

async function main() {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@brightloop.test").toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "Admin@12345";

  await upsertUser(adminEmail, adminPassword, "Asha Admin", "ADMIN");
  await upsertUser("staff@brightloop.test", "Staff@12345", "Sam Staff", "STAFF");
  await upsertUser("customer@brightloop.test", "Customer@123", "Chris Customer", "CUSTOMER", "Corner Shop Pvt Ltd");

  console.log("Seeded users: admin, staff, customer");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
