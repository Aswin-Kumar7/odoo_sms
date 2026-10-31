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

  const admin = await upsertUser(adminEmail, adminPassword, "Asha Admin", "ADMIN");
  const staff = await upsertUser("staff@brightloop.test", "Staff@12345", "Sam Staff", "STAFF");
  await upsertUser("customer@brightloop.test", "Customer@123", "Chris Customer", "CUSTOMER", "Corner Shop Pvt Ltd");

  console.log("Seeded users: admin, staff, customer");

  await seedCatalogue();
  await seedDiscounts();
  await seedSales(admin.id, staff.id);
}

// ───────────── Discounts (upserted by code; usage counts left as they are) ─────────────

async function seedDiscounts() {
  const crm = await prisma.product.findFirstOrThrow({ where: { name: "Brightloop CRM" } });
  const inDays = (n: number) => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + n));
  const rules = [
    { code: "SEATS10", name: "10% off 5 or more CRM seats", kind: "PERCENT", value: 1000, scope: "PRODUCT", productId: crm.id, minQuantity: 5, usageLimit: 2 },
    { code: "LOYAL500", name: "₹500 off orders over ₹10,000", kind: "FIXED", value: 50000, scope: "SUBSCRIPTION", productId: null, minPurchase: 1000000 },
    { code: "LAUNCH20", name: "Launch offer: 20% off for a month", kind: "PERCENT", value: 2000, scope: "SUBSCRIPTION", productId: null, startsOn: inDays(-1), endsOn: inDays(30), usageLimit: 100 },
    { code: "DIWALI15", name: "Festive 15% (ended)", kind: "PERCENT", value: 1500, scope: "SUBSCRIPTION", productId: null, startsOn: inDays(-40), endsOn: inDays(-10) },
  ] as const;
  for (const r of rules) {
    const data = { minPurchase: null, minQuantity: null, startsOn: null, endsOn: null, usageLimit: null, ...r, isActive: true };
    await prisma.discount.upsert({ where: { code: r.code }, update: data, create: data });
  }
  console.log(`Seeded discounts: ${rules.map((r) => r.code).join(", ")}`);
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
  taxId?: number | null;
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
    taxId: null,
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
    { name: "Annual contract (fixed)", price: 1000000, taxId: gst18.id, billingPeriod: "YEARLY", termLength: 1, autoClose: true, closable: false, renewable: false, minQuantity: 10 },
    { name: "Weekly trial", price: 0, billingPeriod: "WEEKLY", termLength: 2, autoClose: true, renewable: false },
    { name: "Daily pay-as-you-go", price: 5000, taxId: gst18.id, billingPeriod: "DAILY" },
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

// ───────────── Customers, templates and subscriptions ─────────────
// Subscriptions are created through the real service functions, so numbering, pricing,
// state transitions and the audit trail are exactly what the app produces.

async function seedSales(adminId: number, staffId: number) {
  const { createSubscription, transition } = await import("../src/modules/subscriptions/subscriptions.service.js");

  const product = async (name: string) => prisma.product.findFirstOrThrow({ where: { name }, include: { variants: { where: { isActive: true } } } });
  const plan = async (name: string) => prisma.recurringPlan.findFirstOrThrow({ where: { name } });
  const [crm, desk, analytics, storage, support, onboarding] = await Promise.all(
    ["Brightloop CRM", "Brightloop Desk", "Analytics add-on", "Extra storage 100 GB", "Support Plus", "Onboarding & training"].map(product),
  );
  const variant = (p: Awaited<ReturnType<typeof product>>, name: string) => p.variants.find((v) => v.name === name)!.id;
  const [monthly, quarterly, yearly, annual] = await Promise.all(["Monthly", "Quarterly", "Yearly", "Annual contract (fixed)"].map(plan));

  // Templates (upserted by name; lines replaced)
  const templates = [
    {
      name: "SMB Starter",
      planId: monthly.id,
      validityDays: 14,
      notes: "Three CRM seats with priority support.",
      lines: [
        { productId: crm.id, variantId: variant(crm, "Brand: Odoo"), quantity: 3 },
        { productId: support.id, variantId: null, quantity: 1 },
      ],
    },
    {
      name: "Enterprise annual",
      planId: annual.id,
      validityDays: 30,
      notes: "Fixed annual contract for 10+ seats with onboarding.",
      lines: [
        { productId: crm.id, variantId: variant(crm, "Brand: Odoo"), quantity: 10 },
        { productId: desk.id, variantId: variant(desk, "Edition: Enterprise"), quantity: 10 },
        { productId: onboarding.id, variantId: null, quantity: 10 },
      ],
    },
    {
      name: "Helpdesk quarterly",
      planId: quarterly.id,
      validityDays: 21,
      notes: "Helpdesk seats billed every three months.",
      lines: [
        { productId: desk.id, variantId: variant(desk, "Edition: Standard"), quantity: 5 },
        { productId: analytics.id, variantId: null, quantity: 1 },
      ],
    },
  ];
  const templateIds: Record<string, number> = {};
  for (const t of templates) {
    const { lines, ...fields } = t;
    const existing = await prisma.quotationTemplate.findFirst({ where: { name: t.name } });
    const saved = existing
      ? await prisma.$transaction(async (tx) => {
          await tx.quotationTemplateLine.deleteMany({ where: { templateId: existing.id } });
          return tx.quotationTemplate.update({ where: { id: existing.id }, data: { ...fields, isActive: true, lines: { create: lines } } });
        })
      : await prisma.quotationTemplate.create({ data: { ...fields, lines: { create: lines } } });
    templateIds[t.name] = saved.id;
  }

  // Customers (found by email)
  const customerData = [
    { name: "Corner Shop Pvt Ltd", email: "customer@brightloop.test", phone: "+91 98450 11111", taxId: "29ABCDE1234F1Z5" },
    { name: "Nimbus Logistics", email: "billing@nimbus.test", phone: "+91 80 4000 1234", taxId: "29NIMBS4321K1Z2" },
    { name: "Saffron Foods", email: "accounts@saffron.test", phone: "+91 22 6600 7788", taxId: "27SAFFR9876L1Z9" },
    { name: "Orbit Media Studio", email: "finance@orbitmedia.test", phone: "+91 44 2811 9090", taxId: null },
    { name: "Kaveri Health Clinics", email: "admin@kaverihealth.test", phone: "+91 80 2222 3333", taxId: "29KAVER5555M1Z1" },
  ];
  const customers: Record<string, number> = {};
  for (const c of customerData) {
    const existing = await prisma.customer.findFirst({ where: { email: c.email } });
    customers[c.name] = existing ? (await prisma.customer.update({ where: { id: existing.id }, data: c })).id : (await prisma.customer.create({ data: c })).id;
  }

  // Subscriptions: only for demo customers that have none yet, so re-running doesn't duplicate.
  const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  type Step = "send_quote" | "confirm" | "activate" | "pause";
  const scenarios: { customer: string; template?: string; planId?: number; lines?: { productId: number; variantId?: number | null; quantity: number }[]; steps: Step[] }[] = [
    { customer: "Corner Shop Pvt Ltd", template: "SMB Starter", steps: ["send_quote", "confirm", "activate"] },
    { customer: "Nimbus Logistics", template: "Enterprise annual", steps: ["send_quote", "confirm", "activate"] },
    { customer: "Saffron Foods", template: "Helpdesk quarterly", steps: ["send_quote", "confirm", "activate", "pause"] },
    { customer: "Orbit Media Studio", template: "SMB Starter", steps: ["send_quote"] },
    {
      customer: "Kaveri Health Clinics",
      planId: yearly.id,
      lines: [
        { productId: crm.id, variantId: variant(crm, "Brand: Generic"), quantity: 4 },
        { productId: storage.id, quantity: 3 },
      ],
      steps: [],
    },
  ];
  let created = 0;
  for (const s of scenarios) {
    const customerId = customers[s.customer];
    if (await prisma.subscription.count({ where: { customerId } })) continue;
    let sub = await createSubscription(
      { customerId, templateId: s.template ? templateIds[s.template] : undefined, planId: s.planId, startDate: start, lines: s.lines },
      staffId,
    );
    for (const step of s.steps) sub = await transition(sub.id, step, { userId: step === "activate" ? adminId : staffId });
    created++;
  }
  // Corner Shop has 3 CRM seats, so SEATS10 shows why it doesn't apply; Nimbus qualifies for LOYAL500.
  const attachments: [string, string][] = [
    ["Corner Shop Pvt Ltd", "SEATS10"],
    ["Nimbus Logistics", "LOYAL500"],
  ];
  for (const [customerName, code] of attachments) {
    const sub = await prisma.subscription.findFirst({ where: { customerId: customers[customerName], status: { not: "CLOSED" } }, orderBy: { id: "asc" } });
    const discount = await prisma.discount.findUnique({ where: { code } });
    if (sub && discount) {
      await prisma.subscriptionDiscount.upsert({
        where: { subscriptionId_discountId: { subscriptionId: sub.id, discountId: discount.id } },
        update: {},
        create: { subscriptionId: sub.id, discountId: discount.id, attachedById: staffId },
      });
    }
  }
  console.log(`Seeded sales: ${templates.length} templates, ${customerData.length} customers, ${created} new subscriptions`);
}
