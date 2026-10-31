import { Prisma, type BillingTrigger } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { conflict } from "../../lib/errors.js";
import { addDays, isoDate } from "../../lib/dates.js";
import { nextPeriodStart, termEnd } from "../../lib/periods.js";
import { logActivity } from "../../lib/activity.js";
import { priceWithDiscounts } from "../pricing/engine.js";
import { buildPricingLines } from "../subscriptions/subscriptions.service.js";

// The billing engine ("nothing billed twice or skipped").
//
// Guarantees, each enforced by the database rather than by hope:
//  • One run at a time — a RUNNING row in billing_runs, protected by a partial unique index.
//  • Never billed twice — each period is claimed by a compare-and-set on the subscription's
//    billing cursor, and invoices(subscription_id, period_start) is a partial unique index.
//  • Never skipped — the catch-up loop bills every period from the cursor up to `asOf`.
//  • Discount usage never exceeds its limit — conditional increment + CHECK constraint.
//  • One bad subscription never stops the run — each subscription bills in its own
//    transaction; failures are recorded on the run and retried next time.

const STALE_RUN_MINUTES = 15;
const BATCH_SIZE = 100;
const CONCURRENCY = 4; // subscriptions billed in parallel (each in its own transaction)
const MAX_PERIODS_PER_RUN = 60; // safety valve for long catch-ups on daily plans; the rest bill next run

export interface RunSummary {
  id: number;
  asOf: string;
  status: string;
  activatedCount: number;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  closedCount: number;
  errors: { subscription: string; message: string }[];
  durationMs: number;
}

const billingInclude = {
  plan: { include: { tax: { select: { id: true, name: true, rateBp: true } } } },
  lines: { orderBy: { id: "asc" as const }, include: { tax: { select: { id: true, name: true, rateBp: true } } } },
  discounts: { include: { discount: true } },
} satisfies Prisma.SubscriptionInclude;

/** Thrown inside a period transaction when a discount ran out between pricing and redeeming. */
class DiscountExhausted extends Error {}

async function nextInvoiceNumber(tx: Prisma.TransactionClient, issueDate: Date) {
  const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('invoice_number_seq') AS n`;
  return `INV-${issueDate.getUTCFullYear()}-${String(n).padStart(6, "0")}`;
}

/**
 * Bills one period of one subscription in a single transaction.
 * Returns "created" or "skipped" (period already billed by someone else).
 */
async function billPeriod(subId: number, periodStart: Date, runId: number, userId: number | null): Promise<"created" | "skipped"> {
  for (let attempt = 0; attempt < 3; attempt++) {
    // Fresh read each attempt: lines, plan, discounts and their usage as they are now.
    const sub = await prisma.subscription.findUnique({ relationLoadStrategy: "join", where: { id: subId }, include: billingInclude });
    if (!sub || sub.status !== "ACTIVE" || !sub.nextBillingDate || sub.nextBillingDate.getTime() !== periodStart.getTime()) return "skipped";

    const periodEnd = nextPeriodStart(sub.startDate, sub.plan.billingPeriod, sub.plan.billingInterval, periodStart);
    const priced = priceWithDiscounts(buildPricingLines(sub), sub.discounts.map((d) => d.discount), periodStart);
    const redeemed = priced.discounts.filter((o) => o.amount > 0);

    try {
      await prisma.$transaction(async (tx) => {
        // 1. Claim the period: advance the cursor only if it still points at this period.
        const claim = await tx.subscription.updateMany({
          where: { id: subId, status: "ACTIVE", nextBillingDate: periodStart },
          data: { nextBillingDate: periodEnd, version: { increment: 1 } },
        });
        if (claim.count === 0) throw new SkipPeriod();

        // 2. Redeem discounts atomically; if one ran out meanwhile, re-price without it.
        for (const o of redeemed) {
          const rows = await tx.$executeRaw`
            UPDATE discounts SET usage_count = usage_count + 1, updated_at = now()
            WHERE id = ${o.discountId} AND (usage_limit IS NULL OR usage_count < usage_limit)`;
          if (rows === 0) throw new DiscountExhausted();
        }

        // 3. Snapshot the invoice: lines, rates and amounts are copied, never referenced.
        const invoice = await tx.invoice.create({
          data: {
            number: await nextInvoiceNumber(tx, periodStart),
            subscriptionId: subId,
            customerId: sub.customerId,
            status: "DRAFT",
            periodStart,
            periodEnd,
            issueDate: periodStart,
            dueDate: addDays(periodStart, sub.paymentTermDays),
            subtotal: priced.subtotal,
            discountTotal: priced.discountTotal,
            taxTotal: priced.taxTotal,
            total: priced.total,
            billingRunId: runId,
            lines: {
              createMany: {
                data: priced.lines.map((l) => ({
                  productId: l.productId,
                  description: l.description,
                  quantity: l.quantity,
                  unitPrice: l.unitPrice,
                  discountAmount: l.discountAmount,
                  taxRateBp: l.taxRateBp,
                  taxAmount: l.taxAmount,
                  lineTotal: l.lineTotal,
                })),
              },
            },
            ...(redeemed.length ? { discounts: { createMany: { data: redeemed.map((o) => ({ discountId: o.discountId, amount: o.amount })) } } } : {}),
          },
          select: { id: true, number: true },
        });
        await logActivity(tx, {
          entityType: "invoice",
          entityId: invoice.id,
          action: "created",
          toStatus: "DRAFT",
          userId,
          meta: { billingRunId: runId, subscriptionId: subId, period: `${isoDate(periodStart)}..${isoDate(periodEnd)}` },
        });
      });
      return "created";
    } catch (err) {
      if (err instanceof SkipPeriod) return "skipped";
      if (err instanceof DiscountExhausted) continue; // re-read and re-price
      // The unique (subscription_id, period_start) index refused a duplicate: already billed.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "skipped";
      throw err;
    }
  }
  throw new Error("Could not bill period: discounts kept changing; will retry next run");
}

class SkipPeriod extends Error {}

/** Activates a confirmed subscription whose start date has arrived (same side effects as a manual activation). */
async function autoActivate(subId: number, asOf: Date, userId: number | null) {
  const sub = await prisma.subscription.findUnique({ relationLoadStrategy: "join", where: { id: subId }, include: { plan: true } });
  if (!sub || sub.status !== "CONFIRMED" || sub.startDate > asOf) return false;
  const { billingPeriod, billingInterval, termLength } = sub.plan;
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.subscription.updateMany({
      where: { id: subId, status: "CONFIRMED", version: sub.version },
      data: {
        status: "ACTIVE",
        nextBillingDate: sub.startDate,
        ...(!sub.expiryDate && termLength ? { expiryDate: termEnd(sub.startDate, billingPeriod, billingInterval, termLength) } : {}),
        version: { increment: 1 },
      },
    });
    if (count === 0) return false;
    await logActivity(tx, { entityType: "subscription", entityId: subId, action: "auto_activate", fromStatus: "CONFIRMED", toStatus: "ACTIVE", userId });
    return true;
  });
}

/** Runs async work over items with a fixed number in flight. */
async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

export async function runBilling(opts: { asOf: Date; trigger: BillingTrigger; userId: number | null }): Promise<RunSummary> {
  const started = Date.now();

  // Recover from a crashed run so the lock can't be held forever.
  await prisma.billingRun.updateMany({
    where: { status: "RUNNING", startedAt: { lt: new Date(Date.now() - STALE_RUN_MINUTES * 60_000) } },
    data: { status: "FAILED", finishedAt: new Date(), errors: [{ subscription: "-", message: "Run did not finish (stale)" }] },
  });

  let run;
  try {
    run = await prisma.billingRun.create({ data: { asOf: opts.asOf, trigger: opts.trigger, triggeredById: opts.userId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw conflict("A billing run is already in progress. Try again in a moment.", "BILLING_IN_PROGRESS");
    }
    throw err;
  }

  const counts = { activatedCount: 0, createdCount: 0, skippedCount: 0, failedCount: 0, closedCount: 0 };
  const errors: { subscription: string; message: string }[] = [];
  const fail = (number: string, err: unknown) => {
    counts.failedCount++;
    errors.push({ subscription: number, message: err instanceof Error ? err.message.slice(0, 300) : String(err) });
  };

  try {
    // 1. Activate confirmed subscriptions whose start date has arrived.
    const toActivate = await prisma.subscription.findMany({ where: { status: "CONFIRMED", startDate: { lte: opts.asOf } }, select: { id: true, number: true } });
    await pool(toActivate, CONCURRENCY, async (s) => {
      try {
        if (await autoActivate(s.id, opts.asOf, opts.userId)) counts.activatedCount++;
      } catch (err) {
        fail(s.number, err);
      }
    });

    // 2. Bill every due period, keyset-paginated so memory stays flat with thousands of subscriptions.
    let afterId = 0;
    for (;;) {
      const batch = await prisma.subscription.findMany({
        where: { id: { gt: afterId }, status: "ACTIVE", nextBillingDate: { lte: opts.asOf } },
        orderBy: { id: "asc" },
        take: BATCH_SIZE,
        select: { id: true, number: true, nextBillingDate: true, expiryDate: true, startDate: true, plan: { select: { billingPeriod: true, billingInterval: true } } },
      });
      if (batch.length === 0) break;
      afterId = batch[batch.length - 1].id;

      await pool(batch, CONCURRENCY, async (s) => {
        // Catch-up loop: bill each period from the cursor up to asOf (and before expiry).
        let cursor = s.nextBillingDate!;
        for (let n = 0; n < MAX_PERIODS_PER_RUN && cursor <= opts.asOf && (!s.expiryDate || cursor < s.expiryDate); n++) {
          try {
            const result = await billPeriod(s.id, cursor, run.id, opts.userId);
            counts[result === "created" ? "createdCount" : "skippedCount"]++;
            if (result === "skipped") break;
          } catch (err) {
            fail(s.number, err);
            break;
          }
          cursor = nextPeriodStart(s.startDate, s.plan.billingPeriod, s.plan.billingInterval, cursor);
        }
      });
    }

    // 3. Close subscriptions that reached their expiry on plans that close on their own.
    const toClose = await prisma.subscription.findMany({
      where: { status: { in: ["ACTIVE", "PAUSED"] }, expiryDate: { lte: opts.asOf }, plan: { autoClose: true } },
      select: { id: true, number: true, status: true, version: true },
    });
    await pool(toClose, CONCURRENCY, async (s) => {
      try {
        await prisma.$transaction(async (tx) => {
          const { count } = await tx.subscription.updateMany({
            where: { id: s.id, status: s.status, version: s.version },
            data: { status: "CLOSED", closedAt: new Date(), closeReason: "Reached expiry date", version: { increment: 1 } },
          });
          if (count === 0) return;
          await logActivity(tx, { entityType: "subscription", entityId: s.id, action: "auto_close", fromStatus: s.status, toStatus: "CLOSED", userId: opts.userId });
          counts.closedCount++;
        });
      } catch (err) {
        fail(s.number, err);
      }
    });

    const done = await prisma.billingRun.update({
      where: { id: run.id },
      data: { ...counts, errors, status: "COMPLETED", finishedAt: new Date() },
    });
    return { id: done.id, asOf: isoDate(done.asOf), status: done.status, ...counts, errors, durationMs: Date.now() - started };
  } catch (err) {
    // Unexpected failure: release the lock by marking the run failed. Committed invoices stay; a rerun continues.
    errors.push({ subscription: "-", message: err instanceof Error ? err.message.slice(0, 300) : String(err) });
    await prisma.billingRun.update({ where: { id: run.id }, data: { ...counts, errors, status: "FAILED", finishedAt: new Date() } });
    throw err;
  }
}
