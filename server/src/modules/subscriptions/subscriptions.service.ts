import { Prisma, type SubscriptionStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError, businessRule, conflict, notFound } from "../../lib/errors.js";
import { paging } from "../../lib/http.js";
import { addDays, today } from "../../lib/dates.js";
import { periodIndex, periodStart, termEnd } from "../../lib/periods.js";
import { logActivity } from "../../lib/activity.js";
import { invalidateReports } from "../../lib/cache.js";
import { priceWithDiscounts, type PricingLine } from "../pricing/engine.js";
import { availableActions, checkTransition, EDITABLE_STATUSES, TransitionError, type Action, type Actor } from "./stateMachine.js";

type Tx = Prisma.TransactionClient;

const DEFAULT_QUOTE_VALIDITY_DAYS = 30;

export interface LineInput {
  productId: number;
  variantId?: number | null;
  quantity: number;
  unitPrice?: number; // defaults to sales price + variant extra
  taxId?: number | null; // undefined → product's default tax; null → no tax
  description?: string;
}

const detailInclude = {
  customer: { select: { id: true, name: true, email: true } },
  plan: { include: { tax: { select: { id: true, name: true, rateBp: true } } } },
  template: { select: { id: true, name: true, validityDays: true } },
  createdBy: { select: { id: true, name: true } },
  lines: {
    orderBy: { id: "asc" as const },
    include: {
      product: { select: { id: true, name: true } },
      variant: { select: { id: true, name: true } },
      tax: { select: { id: true, name: true, rateBp: true } },
    },
  },
  discounts: { orderBy: { attachedAt: "asc" as const }, include: { discount: { include: { product: { select: { id: true, name: true } } } } } },
  invoices: {
    orderBy: { periodStart: "desc" as const },
    take: 24,
    select: { id: true, number: true, status: true, periodStart: true, periodEnd: true, dueDate: true, total: true, amountPaid: true },
  },
} satisfies Prisma.SubscriptionInclude;

type SubscriptionDetail = Prisma.SubscriptionGetPayload<{ include: typeof detailInclude }>;

/** Turns a subscription into engine input: the plan's base fee (if any) plus each product line. */
export interface PricingSource {
  plan: { name: string; price: number; tax: { rateBp: number } | null };
  lines: { id: number; productId: number; description: string; quantity: number; unitPrice: number; tax: { rateBp: number } | null }[];
}

export function buildPricingLines(sub: PricingSource): PricingLine[] {
  const lines: PricingLine[] = [];
  if (sub.plan.price > 0) {
    lines.push({
      key: "plan",
      productId: null,
      description: `${sub.plan.name} plan fee`,
      quantity: 1,
      unitPrice: sub.plan.price,
      taxRateBp: sub.plan.tax?.rateBp ?? 0,
    });
  }
  for (const l of sub.lines) {
    lines.push({
      key: `line:${l.id}`,
      productId: l.productId,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      taxRateBp: l.tax?.rateBp ?? 0,
    });
  }
  return lines;
}

/**
 * Date the next invoice will be priced on: the billing cursor once active, otherwise the
 * first billing date (start date, or today if that has passed). Discounts are judged on it.
 */
export function pricingDate(sub: Pick<SubscriptionDetail, "status" | "nextBillingDate" | "startDate">): Date {
  if (sub.status === "ACTIVE" && sub.nextBillingDate) return sub.nextBillingDate;
  const t = today();
  return sub.startDate > t ? sub.startDate : t;
}

function transitionContext(sub: SubscriptionDetail) {
  return {
    status: sub.status,
    plan: sub.plan,
    lineCount: sub.lines.length,
    quoteExpiresAt: sub.quoteExpiresAt,
    startDate: sub.startDate,
    expiryDate: sub.expiryDate,
    today: today(),
  };
}

async function loadDetail(id: number, db: Tx | typeof prisma = prisma) {
  const sub = await db.subscription.findUnique({ relationLoadStrategy: "join", where: { id }, include: detailInclude });
  if (!sub) throw notFound("Subscription");
  return sub;
}

/** Full view for the UI: subscription, priced totals, allowed actions and timeline. */
export async function getSubscription(id: number, actor: Actor = "staff", customerId?: number) {
  const [sub, timeline] = await Promise.all([
    loadDetail(id),
    prisma.activityLog.findMany({
      relationLoadStrategy: "join",
      where: { entityType: "subscription", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { name: true, role: true } } },
    }),
  ]);
  // A customer asking for someone else's subscription gets a 404, not a 403: no existence leak.
  if (customerId !== undefined && sub.customerId !== customerId) throw notFound("Subscription");
  return {
    ...sub,
    pricedOn: pricingDate(sub),
    totals: priceWithDiscounts(buildPricingLines(sub), sub.discounts.map((sd) => sd.discount), pricingDate(sub)),
    actions: availableActions(transitionContext(sub), actor),
    editable: EDITABLE_STATUSES.includes(sub.status),
    timeline,
  };
}

/** A customer's own subscriptions with totals and the self-service actions their plans allow. Drafts stay internal. */
export async function listCustomerSubscriptions(customerId: number) {
  const subs = await prisma.subscription.findMany({
    relationLoadStrategy: "join",
    where: { customerId, status: { not: "DRAFT" } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: detailInclude,
  });
  return subs.map((sub) => ({
    ...sub,
    pricedOn: pricingDate(sub),
    totals: priceWithDiscounts(buildPricingLines(sub), sub.discounts.map((sd) => sd.discount), pricingDate(sub)),
    actions: availableActions(transitionContext(sub), "customer"),
  }));
}

export async function listSubscriptions(opts: {
  page: number;
  pageSize: number;
  q?: string;
  status?: SubscriptionStatus;
  customerId?: number;
  planId?: number;
}) {
  const base: Prisma.SubscriptionWhereInput = {
    ...(opts.customerId ? { customerId: opts.customerId } : {}),
    ...(opts.planId ? { planId: opts.planId } : {}),
    ...(opts.q
      ? {
          OR: [
            { number: { contains: opts.q, mode: "insensitive" } },
            { customer: { name: { contains: opts.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const where = { ...base, ...(opts.status ? { status: opts.status } : {}) };
  // Three queries in parallel: one round trip of latency instead of three.
  const [total, data, grouped] = await Promise.all([
    prisma.subscription.count({ where }),
    prisma.subscription.findMany({
      relationLoadStrategy: "join",
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        number: true,
        status: true,
        startDate: true,
        expiryDate: true,
        nextBillingDate: true,
        quoteExpiresAt: true,
        customer: { select: { id: true, name: true } },
        plan: { select: { id: true, name: true, billingPeriod: true, billingInterval: true } },
        _count: { select: { lines: true } },
      },
      ...paging(opts.page, opts.pageSize),
    }),
    prisma.subscription.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
  return { data, page: opts.page, pageSize: opts.pageSize, total, counts };
}

// ───────────────────────── Validation helpers ─────────────────────────
//
// Latency note: each statement to the hosted database costs ~100 ms. Commands therefore
// do their validation READS outside the transaction (in parallel where possible) and keep
// only the WRITES inside it. Correctness is preserved by the compare-and-set on
// (status, version): if anything changed between the read and the write, the write fails.

type Db = Tx | typeof prisma;

async function loadSellablePlan(db: Db, planId: number, onDate: Date) {
  const plan = await db.recurringPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive) throw businessRule("Selected plan does not exist or is inactive");
  if ((plan.availableFrom && onDate < plan.availableFrom) || (plan.availableTo && onDate > plan.availableTo)) {
    throw businessRule(`The ${plan.name} plan is not available on the start date`);
  }
  return plan;
}

/** Loads the products and taxes referenced by line inputs, in parallel. */
async function loadCatalogueFor(inputs: LineInput[]) {
  const productIds = [...new Set(inputs.map((l) => l.productId))];
  const taxIds = [...new Set(inputs.map((l) => l.taxId).filter((t): t is number => typeof t === "number"))];
  const [products, taxes] = await Promise.all([
    productIds.length
      ? prisma.product.findMany({ relationLoadStrategy: "join", where: { id: { in: productIds } }, include: { variants: { where: { isActive: true } } } })
      : Promise.resolve([]),
    taxIds.length ? prisma.tax.findMany({ where: { id: { in: taxIds }, isActive: true }, select: { id: true } }) : Promise.resolve([]),
  ]);
  return { products: new Map(products.map((p) => [p.id, p])), activeTaxIds: new Set(taxes.map((t) => t.id)) };
}

type Catalogue = Awaited<ReturnType<typeof loadCatalogueFor>>;

/** Resolves line inputs against the catalogue: defaults price/tax/description, checks variants and minimum quantity. */
function resolveLines(inputs: LineInput[], catalogue: Catalogue, minQuantity: number, planName: string) {
  return inputs.map((l) => {
    const product = catalogue.products.get(l.productId);
    if (!product || !product.isActive) throw businessRule(`Product ${l.productId} does not exist or is archived`);
    const variant = l.variantId ? product.variants.find((v) => v.id === l.variantId) : undefined;
    if (l.variantId && !variant) throw businessRule(`The selected variant is not available for ${product.name}`);
    if (l.quantity < minQuantity) throw businessRule(`Quantity must be at least ${minQuantity} for the ${planName} plan`);
    if (typeof l.taxId === "number" && !catalogue.activeTaxIds.has(l.taxId)) throw businessRule("A selected tax does not exist or is inactive");
    return {
      productId: product.id,
      variantId: variant?.id ?? null,
      quantity: l.quantity,
      unitPrice: l.unitPrice ?? product.salesPrice + (variant?.priceExtra ?? 0),
      taxId: l.taxId === undefined ? product.taxId : l.taxId,
      description: l.description?.trim() || (variant ? `${product.name} (${variant.name})` : product.name),
    };
  });
}

/** Compare-and-set: applies the change only if status and version are still what was read. */
async function casUpdate(db: Tx, id: number, expect: { statuses: SubscriptionStatus[]; version: number }, data: Prisma.SubscriptionUpdateManyMutationInput) {
  const { count } = await db.subscription.updateMany({
    where: { id, status: { in: expect.statuses }, version: expect.version },
    data: { ...data, version: { increment: 1 } },
  });
  if (count === 0) throw conflict("This subscription was changed by someone else. Reload and try again.", "STALE_STATE");
}

function assertVersion(clientVersion: number | undefined, current: number) {
  if (clientVersion !== undefined && clientVersion !== current) {
    throw conflict("This subscription was changed by someone else. Reload and try again.", "STALE_STATE");
  }
}

// ───────────────────────── Commands ─────────────────────────

export async function createSubscription(
  input: { customerId: number; templateId?: number; planId?: number; startDate: Date; paymentTermDays?: number; notes?: string | null; lines?: LineInput[] },
  userId: number,
) {
  const [customer, template] = await Promise.all([
    prisma.customer.findUnique({ where: { id: input.customerId }, select: { id: true } }),
    input.templateId ? prisma.quotationTemplate.findUnique({ relationLoadStrategy: "join", where: { id: input.templateId }, include: { lines: true } }) : null,
  ]);
  if (!customer) throw businessRule("Customer not found");
  if (input.templateId && (!template || !template.isActive)) throw businessRule("Template not found or inactive");

  const planId = template?.planId ?? input.planId;
  if (!planId) throw businessRule("Choose a plan or a quotation template");
  const lineInputs = input.lines ?? template?.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })) ?? [];

  const [plan, catalogue] = await Promise.all([loadSellablePlan(prisma, planId, input.startDate), loadCatalogueFor(lineInputs)]);
  const lines = resolveLines(lineInputs, catalogue, plan.minQuantity, plan.name);

  const id = await prisma.$transaction(async (tx) => {
    const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('subscription_number_seq') AS n`;
    const sub = await tx.subscription.create({
      data: {
        number: `SUB-${String(n).padStart(6, "0")}`,
        customerId: input.customerId,
        planId,
        templateId: input.templateId ?? null,
        startDate: input.startDate,
        paymentTermDays: input.paymentTermDays ?? 15,
        notes: input.notes ?? null,
        createdById: userId,
        lines: { createMany: { data: lines } },
      },
      select: { id: true },
    });
    await logActivity(tx, { entityType: "subscription", entityId: sub.id, action: "created", toStatus: "DRAFT", userId, meta: input.templateId ? { templateId: input.templateId } : undefined });
    return sub.id;
  });
  return getSubscription(id);
}

export async function updateSubscription(
  id: number,
  input: { version: number; customerId?: number; planId?: number; startDate?: Date; expiryDate?: Date | null; paymentTermDays?: number; notes?: string | null },
  userId: number,
) {
  const { version, ...changes } = input;
  const sub = await prisma.subscription.findUnique({ relationLoadStrategy: "join", where: { id }, include: { lines: { select: { quantity: true } } } });
  if (!sub) throw notFound("Subscription");
  if (!EDITABLE_STATUSES.includes(sub.status)) throw businessRule("Only draft or quotation subscriptions can be edited");
  assertVersion(version, sub.version);

  const [customerOk, plan] = await Promise.all([
    changes.customerId ? prisma.customer.findUnique({ where: { id: changes.customerId }, select: { id: true } }) : Promise.resolve(true),
    changes.planId !== undefined || changes.startDate !== undefined ? loadSellablePlan(prisma, changes.planId ?? sub.planId, changes.startDate ?? sub.startDate) : Promise.resolve(null),
  ]);
  if (!customerOk) throw businessRule("Customer not found");
  if (plan && sub.lines.some((l) => l.quantity < plan.minQuantity)) {
    throw businessRule(`Every line needs a quantity of at least ${plan.minQuantity} for the ${plan.name} plan`);
  }
  const start = changes.startDate ?? sub.startDate;
  const expiry = changes.expiryDate !== undefined ? changes.expiryDate : sub.expiryDate;
  if (expiry && expiry <= start) throw businessRule("Expiry date must be after the start date");

  await prisma.$transaction(async (tx) => {
    await casUpdate(tx, id, { statuses: EDITABLE_STATUSES, version }, changes);
    await logActivity(tx, { entityType: "subscription", entityId: id, action: "updated", userId, meta: { fields: Object.keys(changes) } });
  });
  return getSubscription(id);
}

export async function replaceLines(id: number, version: number, inputs: LineInput[], userId: number) {
  const [sub, catalogue] = await Promise.all([
    prisma.subscription.findUnique({ relationLoadStrategy: "join", where: { id }, include: { plan: true } }),
    loadCatalogueFor(inputs),
  ]);
  if (!sub) throw notFound("Subscription");
  if (!EDITABLE_STATUSES.includes(sub.status)) throw businessRule("Lines can only be changed on draft or quotation subscriptions");
  assertVersion(version, sub.version);
  const lines = resolveLines(inputs, catalogue, sub.plan.minQuantity, sub.plan.name);

  await prisma.$transaction(async (tx) => {
    await casUpdate(tx, id, { statuses: EDITABLE_STATUSES, version }, {});
    await tx.subscriptionLine.deleteMany({ where: { subscriptionId: id } });
    await tx.subscriptionLine.createMany({ data: lines.map((l) => ({ ...l, subscriptionId: id })) });
    await logActivity(tx, { entityType: "subscription", entityId: id, action: "lines_updated", userId, meta: { lineCount: lines.length } });
  });
  return getSubscription(id);
}

/** Applies a lifecycle action: state-machine check, side effects, compare-and-set, audit entry. */
export async function transition(
  id: number,
  action: Action,
  opts: { userId: number; actor?: Actor; version?: number; reason?: string; customerId?: number },
) {
  const actor = opts.actor ?? "staff";
  const sub = await loadDetail(id);
  if (opts.customerId !== undefined && sub.customerId !== opts.customerId) throw notFound("Subscription");
  assertVersion(opts.version, sub.version);

  let to: SubscriptionStatus;
  try {
    to = checkTransition(action, transitionContext(sub), actor);
  } catch (e) {
    if (e instanceof TransitionError) {
      throw e.kind === "invalid_state" ? conflict(e.message, "INVALID_TRANSITION") : e.kind === "forbidden" ? new AppError(403, "FORBIDDEN", e.message) : businessRule(e.message);
    }
    throw e;
  }

  const now = new Date();
  const t = today();
  const { billingPeriod: period, billingInterval: interval, termLength } = sub.plan;
  const data: Prisma.SubscriptionUpdateManyMutationInput = { status: to };
  const meta: Record<string, string | null> = {};

  switch (action) {
    case "send_quote":
      data.quoteExpiresAt = addDays(t, sub.template?.validityDays ?? DEFAULT_QUOTE_VALIDITY_DAYS);
      meta.quoteExpiresAt = data.quoteExpiresAt.toISOString().slice(0, 10);
      break;
    case "activate":
      data.nextBillingDate = sub.startDate;
      if (!sub.expiryDate && termLength) data.expiryDate = termEnd(sub.startDate, period, interval, termLength);
      break;
    case "pause":
      data.pausedAt = now;
      break;
    case "resume": {
      // Periods that started while paused are not billed: move the cursor to the first period starting today or later.
      data.pausedAt = null;
      if (sub.nextBillingDate && sub.nextBillingDate < t) {
        let k = periodIndex(sub.startDate, period, interval, t);
        if (periodStart(sub.startDate, period, interval, k) < t) k++;
        data.nextBillingDate = periodStart(sub.startDate, period, interval, k);
        meta.nextBillingDate = data.nextBillingDate.toISOString().slice(0, 10);
      }
      break;
    }
    case "close":
    case "cancel":
      data.closedAt = now;
      data.closeReason = opts.reason ?? (action === "cancel" ? "Cancelled before activation" : "Closed early");
      meta.reason = data.closeReason as string;
      break;
    case "renew": {
      const k = periodIndex(sub.startDate, period, interval, sub.expiryDate!);
      data.expiryDate = periodStart(sub.startDate, period, interval, k + (termLength ?? 1));
      meta.previousExpiry = sub.expiryDate!.toISOString().slice(0, 10);
      meta.newExpiry = data.expiryDate.toISOString().slice(0, 10);
      break;
    }
  }

  // The version read above guards every side effect computed from it (e.g. renewing from the current expiry).
  await prisma.$transaction(async (tx) => {
    await casUpdate(tx, id, { statuses: [sub.status], version: sub.version }, data);
    await logActivity(tx, { entityType: "subscription", entityId: id, action, fromStatus: sub.status, toStatus: to, userId: opts.userId, meta });
  });
  invalidateReports();
  return getSubscription(id, actor, opts.customerId);
}

// ───────────────────────── Discounts on a subscription ─────────────────────────

/** Attaching a discount means it applies to every future invoice while it stays valid. */
export async function attachDiscount(id: number, discountId: number, userId: number) {
  const [sub, discount] = await Promise.all([
    prisma.subscription.findUnique({ where: { id }, select: { status: true } }),
    prisma.discount.findUnique({ where: { id: discountId } }),
  ]);
  if (!sub) throw notFound("Subscription");
  if (sub.status === "CLOSED") throw businessRule("Discounts cannot be added to a closed subscription");
  if (!discount || !discount.isActive) throw businessRule("Discount not found or inactive");

  try {
    await prisma.$transaction(async (tx) => {
      await tx.subscriptionDiscount.create({ data: { subscriptionId: id, discountId, attachedById: userId } });
      await logActivity(tx, { entityType: "subscription", entityId: id, action: "discount_attached", userId, meta: { code: discount.code } });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw conflict("This discount is already on the subscription");
    throw err;
  }
  return getSubscription(id);
}

export async function detachDiscount(id: number, discountId: number, userId: number) {
  const link = await prisma.subscriptionDiscount.findUnique({
    relationLoadStrategy: "join",
    where: { subscriptionId_discountId: { subscriptionId: id, discountId } },
    include: { discount: { select: { code: true } } },
  });
  if (!link) throw notFound("Discount on this subscription");
  await prisma.$transaction(async (tx) => {
    await tx.subscriptionDiscount.delete({ where: { subscriptionId_discountId: { subscriptionId: id, discountId } } });
    await logActivity(tx, { entityType: "subscription", entityId: id, action: "discount_removed", userId, meta: { code: link.discount.code } });
  });
  return getSubscription(id);
}

// ───────────────────────── Pricing preview ─────────────────────────

/** Prices unsaved lines with the same engine and rules used for invoices — nothing is written. */
export async function previewPricing(input: { planId: number; lines: LineInput[]; discountIds?: number[]; asOf?: Date }) {
  const [plan, catalogue, taxes, discounts] = await Promise.all([
    prisma.recurringPlan.findUnique({ relationLoadStrategy: "join", where: { id: input.planId }, include: { tax: true } }),
    loadCatalogueFor(input.lines),
    prisma.tax.findMany({ where: { isActive: true }, select: { id: true, rateBp: true } }),
    input.discountIds?.length ? prisma.discount.findMany({ where: { id: { in: input.discountIds } } }) : Promise.resolve([]),
  ]);
  if (!plan) throw businessRule("Plan not found");
  const rate = new Map(taxes.map((t) => [t.id, t.rateBp]));
  const resolved = resolveLines(input.lines, catalogue, plan.minQuantity, plan.name);
  const lines: PricingLine[] = [
    ...(plan.price > 0 ? [{ key: "plan", productId: null, description: `${plan.name} plan fee`, quantity: 1, unitPrice: plan.price, taxRateBp: plan.tax?.rateBp ?? 0 }] : []),
    ...resolved.map((l, i) => ({
      key: `new:${i}`,
      productId: l.productId,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      taxRateBp: l.taxId ? rate.get(l.taxId) ?? 0 : 0,
    })),
  ];
  return priceWithDiscounts(lines, discounts, input.asOf ?? today());
}
