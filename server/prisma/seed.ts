// Demo data. Safe to re-run: users are upserted by email, catalogue records by name.
// Demo logins (test values only — never real credentials):
//   admin    → SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (defaults: admin@brightloop.test / Admin@12345)
//   staff    → staff@brightloop.test / Staff@12345
//   customer → customer@brightloop.test / Customer@123
import "dotenv/config";
import { PrismaClient, type BillingPeriod, type ProductType, type Role } from "@prisma/client";
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

  await seedCatalogue();
}

// ───────────── Catalogue (prices in paise) ─────────────

async function upsertTax(name: string, rateBp: number) {
  const existing = await prisma.tax.findFirst({ where: { name } });
  return existing
    ? prisma.tax.update({ where: { id: existing.id }, data: { rateBp, isActive: true } })
    : prisma.tax.create({ data: { name, rateBp } });
}

interface SeedProduct {
  name: string;
  type: ProductType;
  salesPrice: number;
  costPrice: number;
  notes: string;
  taxId: number | null;
  variants?: { attribute: string; value: string; priceExtra: number }[];
}

async function upsertProduct(p: SeedProduct) {
  const { variants = [], ...fields } = p;
  const existing = await prisma.product.findFirst({ where: { name: p.name } });
  const product = existing
    ? await prisma.product.update({ where: { id: existing.id }, data: { ...fields, isActive: true } })
    : await prisma.product.create({ data: fields });
  // Variants: deactivate everything, then upsert the seeded ones by (product, name).
  await prisma.productVariant.updateMany({ where: { productId: product.id }, data: { isActive: false } });
  for (const v of variants) {
    const name = `${v.attribute}: ${v.value}`;
    await prisma.productVariant.upsert({
      where: { productId_name: { productId: product.id, name } },
      update: { priceExtra: v.priceExtra, attributes: { [v.attribute]: v.value }, isActive: true },
      create: { productId: product.id, name, priceExtra: v.priceExtra, attributes: { [v.attribute]: v.value } },
    });
  }
  return product;
}

interface SeedPlan {
  name: string;
  price: number;
  billingPeriod: BillingPeriod;
  billingInterval?: number;
  minQuantity?: number;
  termLength?: number | null;
  autoClose?: boolean;
  closable?: boolean;
  pausable?: boolean;
  renewable?: boolean;
  availableFrom?: Date | null;
  availableTo?: Date | null;
}

async function upsertPlan(p: SeedPlan) {
  const data = {
    billingInterval: 1,
    minQuantity: 1,
    termLength: null,
    autoClose: false,
    closable: true,
    pausable: false,
    renewable: true,
    availableFrom: null,
    availableTo: null,
    ...p,
    isActive: true,
  };
  const existing = await prisma.recurringPlan.findFirst({ where: { name: p.name } });
  return existing ? prisma.recurringPlan.update({ where: { id: existing.id }, data }) : prisma.recurringPlan.create({ data });
}

async function seedCatalogue() {
  const gst18 = await upsertTax("GST 18%", 1800);
  await upsertTax("GST 12%", 1200);
  await upsertTax("Exempt", 0);

  const products: SeedProduct[] = [
    {
      name: "Brightloop CRM",
      type: "SOFTWARE_LICENSE",
      salesPrice: 150000,
      costPrice: 40000,
      notes: "Per-seat CRM licence.",
      taxId: gst18.id,
      variants: [
        { attribute: "Brand", value: "Odoo", priceExtra: 56000 },
        { attribute: "Brand", value: "Generic", priceExtra: 0 },
      ],
    },
    {
      name: "Brightloop Desk",
      type: "SOFTWARE_LICENSE",
      salesPrice: 90000,
      costPrice: 25000,
      notes: "Helpdesk seat.",
      taxId: gst18.id,
      variants: [
        { attribute: "Edition", value: "Standard", priceExtra: 0 },
        { attribute: "Edition", value: "Enterprise", priceExtra: 40000 },
      ],
    },
    { name: "Analytics add-on", type: "ADDON", salesPrice: 49900, costPrice: 10000, notes: "Dashboards and exports.", taxId: gst18.id },
    { name: "Extra storage 100 GB", type: "ADDON", salesPrice: 19900, costPrice: 5000, notes: "Billed per 100 GB block.", taxId: gst18.id },
    { name: "Support Plus", type: "SERVICE", salesPrice: 99900, costPrice: 45000, notes: "Priority support, 4-hour response.", taxId: gst18.id },
    { name: "Onboarding & training", type: "SERVICE", salesPrice: 499900, costPrice: 200000, notes: "One onboarding package per period.", taxId: gst18.id },
  ];
  for (const p of products) await upsertProduct(p);

  const plans: SeedPlan[] = [
    { name: "Monthly", price: 0, billingPeriod: "MONTHLY", pausable: true },
    { name: "Quarterly", price: 0, billingPeriod: "MONTHLY", billingInterval: 3, pausable: true },
    { name: "Yearly", price: 0, billingPeriod: "YEARLY", termLength: 1 },
    { name: "Annual contract (fixed)", price: 1000000, billingPeriod: "YEARLY", termLength: 1, autoClose: true, closable: false, renewable: false, minQuantity: 10 },
    { name: "Weekly trial", price: 0, billingPeriod: "WEEKLY", termLength: 2, autoClose: true, renewable: false },
    { name: "Daily pay-as-you-go", price: 5000, billingPeriod: "DAILY" },
  ];
  for (const p of plans) await upsertPlan(p);

  console.log(`Seeded catalogue: 3 taxes, ${products.length} products, ${plans.length} plans`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
