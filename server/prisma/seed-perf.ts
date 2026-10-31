// Bulk performance data: ~1,500 customers, ~5,000 subscriptions with their full invoice and
// payment history (~25,000 invoices). Proves list and dashboard pages stay fast at scale.
//   npm run seed:perf            (after `npm run seed`; refuses to run twice)
//   npm run seed:perf -- --subs=2000
//
// Rows are written with createMany in batches rather than through the billing engine: the
// engine bills one period per transaction, which is the right trade-off for correctness on
// billing day but would take an hour over a remote connection for this volume. Every row is
// still priced by the same pricing engine, and invoice periods follow the same period maths.
import "dotenv/config";
import { PrismaClient, type BillingPeriod, type InvoiceStatus, type PaymentMethod, type SubscriptionStatus } from "@prisma/client";
import { nextPeriodStart, termEnd } from "../src/lib/periods.js";
import { priceLines, type PricingLine } from "../src/modules/pricing/engine.js";
import { addDays, today } from "../src/lib/dates.js";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to load performance data into a production database.");
  process.exit(1);
}

const prisma = new PrismaClient({ transactionOptions: { timeout: 60_000 } });
const SUBS = Number(process.argv.find((a) => a.startsWith("--subs="))?.split("=")[1] ?? 5000);
const CUSTOMERS = Math.max(50, Math.round(SUBS * 0.3));
const DOMAIN = "perf.brightloop.test";

// Deterministic randomness, so two runs of the seed produce the same shape of data.
let seed = 20261031;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(items: T[]) => items[Math.floor(rand() * items.length)];
function weighted<T>(options: [T, number][]): T {
  let r = rand() * options.reduce((a, [, w]) => a + w, 0);
  for (const [v, w] of options) if ((r -= w) < 0) return v;
  return options[options.length - 1][0];
}

async function inBatches<T>(rows: T[], size: number, write: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await write(rows.slice(i, i + size));
}

async function nextNumbers(sequence: "subscription_number_seq" | "invoice_number_seq", count: number) {
  if (count === 0) return [];
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT nextval('${sequence}') AS n FROM generate_series(1, ${count})`);
  return rows.map((r) => Number(r.n));
}

const COMPANY_A = ["Lotus", "Indigo", "Banyan", "Kestrel", "Monsoon", "Granite", "Pebble", "Saffron", "Tidal", "Copper", "Orchid", "Vertex", "Harbor", "Cedar", "Neem", "Falcon", "Amber", "Coral", "Summit", "Zephyr"];
const COMPANY_B = ["Retail", "Logistics", "Foods", "Health", "Labs", "Textiles", "Motors", "Media", "Traders", "Pharma", "Studios", "Systems", "Exports", "Clinics", "Hotels", "Builders"];
const CITIES = ["Bengaluru", "Chennai", "Mumbai", "Pune", "Hyderabad", "Kochi", "Delhi", "Jaipur", "Coimbatore", "Ahmedabad"];

async function main() {
  const existing = await prisma.customer.count({ where: { email: { endsWith: `@${DOMAIN}` } } });
  if (existing > 0) {
    console.log(`Performance data already present (${existing} customers). Reset with \`npm run db:reset-demo -- --yes --perf\` to reload it.`);
    return;
  }
  const started = Date.now();
  const t = today();

  const [products, plans, staff] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true }, include: { variants: { where: { isActive: true } }, tax: true } }),
    prisma.recurringPlan.findMany({ where: { isActive: true, name: { in: ["Monthly", "Quarterly", "Yearly"] } }, include: { tax: true } }),
    prisma.user.findFirst({ where: { role: "STAFF" }, select: { id: true } }),
  ]);
  if (products.length === 0 || plans.length < 3) throw new Error("Run `npm run seed` first: the demo catalogue is missing.");
  const plan = (name: string) => plans.find((p) => p.name === name)!;
  const sellable = products.filter((p) => p.salesPrice > 0);

  // ── Customers
  const customerRows = Array.from({ length: CUSTOMERS }, (_, i) => {
    const name = `${pick(COMPANY_A)} ${pick(COMPANY_B)} ${i + 1}`;
    return { name: `${name} Pvt Ltd`, email: `accounts${i + 1}@${DOMAIN}`, phone: `+91 9${int(100000000, 999999999)}`, address: pick(CITIES) };
  });
  const customers: { id: number }[] = [];
  await inBatches(customerRows, 1000, async (b) => customers.push(...(await prisma.customer.createManyAndReturn({ data: b, select: { id: true } }))));
  console.log(`customers: ${customers.length}`);

  // ── Subscriptions (shape only; ids come back from the insert)
  interface SubPlan {
    row: {
      number: string;
      customerId: number;
      planId: number;
      status: SubscriptionStatus;
      startDate: Date;
      expiryDate: Date | null;
      nextBillingDate: Date | null;
      quoteExpiresAt: Date | null;
      paymentTermDays: number;
      pausedAt: Date | null;
      closedAt: Date | null;
      closeReason: string | null;
      createdById: number | null;
      createdAt: Date;
    };
    lines: { productId: number; variantId: number | null; description: string; quantity: number; unitPrice: number; taxId: number | null; taxRateBp: number }[];
    period: BillingPeriod;
    interval: number;
    billUntil: Date | null; // bill every period starting before this date
    planFee: { name: string; price: number; taxRateBp: number };
  }

  const numbers = await nextNumbers("subscription_number_seq", SUBS);
  const subs: SubPlan[] = numbers.map((num) => {
    const p = weighted([[plan("Monthly"), 65], [plan("Quarterly"), 20], [plan("Yearly"), 15]] as [(typeof plans)[number], number][]);
    const status = weighted<SubscriptionStatus>([["ACTIVE", 72], ["PAUSED", 6], ["CLOSED", 12], ["CONFIRMED", 3], ["QUOTATION", 4], ["DRAFT", 3]]);
    const live = status === "ACTIVE" || status === "PAUSED" || status === "CLOSED";
    // Yearly terms started within the last year, so none is past its expiry.
    const startDate = live ? addDays(t, -int(0, p.billingPeriod === "YEARLY" ? 360 : 400)) : addDays(t, int(1, 30));
    const expiryDate = p.termLength && live ? termEnd(startDate, p.billingPeriod, p.billingInterval, p.termLength) : null;

    let billUntil: Date | null = null;
    let pausedAt: Date | null = null;
    let closedAt: Date | null = null;
    if (status === "ACTIVE") billUntil = addDays(t, 1);
    if (status === "PAUSED") {
      pausedAt = addDays(t, -int(1, Math.max(1, Math.round((t.getTime() - startDate.getTime()) / 864e5))));
      billUntil = pausedAt;
    }
    if (status === "CLOSED") {
      closedAt = addDays(startDate, int(1, Math.max(1, Math.round((t.getTime() - startDate.getTime()) / 864e5))));
      billUntil = closedAt;
    }

    const lineCount = int(1, 3);
    const chosen = [...sellable].sort(() => rand() - 0.5).slice(0, lineCount);
    const lines = chosen.map((prod) => {
      const variant = prod.variants.length && rand() < 0.6 ? pick(prod.variants) : null;
      return {
        productId: prod.id,
        variantId: variant?.id ?? null,
        description: variant ? `${prod.name} (${variant.name})` : prod.name,
        quantity: Math.max(p.minQuantity, int(1, 12)),
        unitPrice: prod.salesPrice + (variant?.priceExtra ?? 0),
        taxId: prod.taxId,
        taxRateBp: prod.tax?.rateBp ?? 0,
      };
    });
    return {
      row: {
        number: `SUB-${String(num).padStart(6, "0")}`,
        customerId: pick(customers).id,
        planId: p.id,
        status,
        startDate,
        expiryDate,
        nextBillingDate: null,
        quoteExpiresAt: status === "QUOTATION" ? addDays(t, int(1, 14)) : null,
        paymentTermDays: pick([15, 15, 15, 30, 7]),
        pausedAt,
        closedAt,
        closeReason: closedAt ? pick(["Customer churned", "Moved to a competitor", "Business closed", "Budget cuts"]) : null,
        createdById: staff?.id ?? null,
        createdAt: addDays(startDate, -int(2, 20)),
      },
      lines,
      period: p.billingPeriod,
      interval: p.billingInterval,
      billUntil,
      planFee: { name: p.name, price: p.price, taxRateBp: p.tax?.rateBp ?? 0 },
    };
  });

  // Billing cursor: active subscriptions point at their first period after today, so the
  // next billing run continues from where this history ends.
  for (const s of subs) {
    if (!s.billUntil) continue;
    let cursor = s.row.startDate;
    while (cursor < s.billUntil && (!s.row.expiryDate || cursor < s.row.expiryDate)) cursor = nextPeriodStart(s.row.startDate, s.period, s.interval, cursor);
    s.row.nextBillingDate = cursor;
  }

  const subIds: number[] = [];
  await inBatches(subs, 1000, async (b) => subIds.push(...(await prisma.subscription.createManyAndReturn({ data: b.map((s) => s.row), select: { id: true } })).map((r) => r.id)));
  await inBatches(
    subs.flatMap((s, i) => s.lines.map(({ taxRateBp: _rate, ...l }) => ({ ...l, subscriptionId: subIds[i] }))),
    2000,
    (b) => prisma.subscriptionLine.createMany({ data: b }),
  );
  console.log(`subscriptions: ${subIds.length}`);

  // ── Invoices: one per billed period, priced by the pricing engine
  type InvoiceRow = {
    number: string;
    subscriptionId: number;
    customerId: number;
    status: InvoiceStatus;
    periodStart: Date;
    periodEnd: Date;
    issueDate: Date;
    dueDate: Date;
    subtotal: number;
    taxTotal: number;
    total: number;
    amountPaid: number;
    sentAt: Date | null;
  };
  const invoices: { row: InvoiceRow; lines: ReturnType<typeof priceLines>["lines"]; paidOn: Date | null }[] = [];
  subs.forEach((s, i) => {
    if (!s.billUntil) return;
    const pricing: PricingLine[] = [
      ...(s.planFee.price > 0 ? [{ key: "plan", productId: null, description: `${s.planFee.name} plan fee`, quantity: 1, unitPrice: s.planFee.price, taxRateBp: s.planFee.taxRateBp }] : []),
      ...s.lines.map((l, k) => ({ key: `line:${k}`, productId: l.productId, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, taxRateBp: l.taxRateBp })),
    ];
    const priced = priceLines(pricing);
    let cursor = s.row.startDate;
    while (cursor < s.billUntil && cursor <= t && (!s.row.expiryDate || cursor < s.row.expiryDate)) {
      const periodEnd = nextPeriodStart(s.row.startDate, s.period, s.interval, cursor);
      const dueDate = addDays(cursor, s.row.paymentTermDays);
      const ageDays = Math.round((t.getTime() - cursor.getTime()) / 864e5);
      const isLatest = periodEnd > t;
      const status: InvoiceStatus =
        dueDate < t
          ? weighted<InvoiceStatus>(ageDays > 60 ? [["PAID", 95], ["CONFIRMED", 5]] : [["PAID", 75], ["CONFIRMED", 25]])
          : weighted<InvoiceStatus>(isLatest ? [["PAID", 35], ["CONFIRMED", 50], ["DRAFT", 15]] : [["PAID", 50], ["CONFIRMED", 50]]);
      const partial = status === "CONFIRMED" && rand() < 0.2 ? Math.round(priced.total * 0.4) : 0;
      const paidOn = status === "PAID" ? addDays(cursor, Math.min(int(0, s.row.paymentTermDays + 10), Math.max(0, ageDays))) : partial ? addDays(cursor, Math.min(int(0, 10), Math.max(0, ageDays))) : null;
      invoices.push({
        row: {
          number: "",
          subscriptionId: subIds[i],
          customerId: s.row.customerId,
          status,
          periodStart: cursor,
          periodEnd,
          issueDate: cursor,
          dueDate,
          subtotal: priced.subtotal,
          taxTotal: priced.taxTotal,
          total: priced.total,
          amountPaid: status === "PAID" ? priced.total : partial,
          sentAt: status === "DRAFT" ? null : cursor,
        },
        lines: priced.lines,
        paidOn,
      });
      cursor = periodEnd;
    }
  });
  const invNumbers = await nextNumbers("invoice_number_seq", invoices.length);
  invoices.forEach((inv, k) => (inv.row.number = `INV-${inv.row.issueDate.getUTCFullYear()}-${String(invNumbers[k]).padStart(6, "0")}`));

  const invoiceIds: number[] = [];
  await inBatches(invoices, 1000, async (b) => invoiceIds.push(...(await prisma.invoice.createManyAndReturn({ data: b.map((x) => x.row), select: { id: true } })).map((r) => r.id)));
  await inBatches(
    invoices.flatMap((inv, k) =>
      inv.lines.map((l) => ({
        invoiceId: invoiceIds[k],
        productId: l.productId,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountAmount: l.discountAmount,
        taxRateBp: l.taxRateBp,
        taxAmount: l.taxAmount,
        lineTotal: l.lineTotal,
      })),
    ),
    3000,
    (b) => prisma.invoiceLine.createMany({ data: b }),
  );
  console.log(`invoices: ${invoiceIds.length}`);

  // ── Payments for paid and part-paid invoices
  const methods: [PaymentMethod, number][] = [["UPI", 40], ["BANK_TRANSFER", 30], ["CARD", 15], ["ONLINE_SIMULATED", 8], ["CHEQUE", 4], ["CASH", 3]];
  const payments = invoices.flatMap((inv, k) =>
    inv.paidOn && inv.row.amountPaid > 0
      ? [{ invoiceId: invoiceIds[k], method: weighted(methods), amount: inv.row.amountPaid, paidOn: inv.paidOn, note: null, recordedById: staff?.id ?? null }]
      : [],
  );
  await inBatches(payments, 3000, (b) => prisma.payment.createMany({ data: b }));
  console.log(`payments: ${payments.length}`);
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
