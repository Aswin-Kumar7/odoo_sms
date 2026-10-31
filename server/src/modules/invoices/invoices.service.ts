import { Prisma, type InvoiceStatus } from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { AppError, businessRule, conflict, notFound } from "../../lib/errors.js";
import { paging } from "../../lib/http.js";
import { addDays, isoDate, today } from "../../lib/dates.js";
import { logActivity } from "../../lib/activity.js";
import { sendMail } from "../../lib/mailer.js";

// Invoice lifecycle: DRAFT → CONFIRMED → PAID, or CANCELLED.
// "Overdue" is derived (CONFIRMED and past due), never stored, so it can't go stale.

export const detailInclude = {
  customer: { select: { id: true, name: true, email: true, address: true, taxId: true, phone: true } },
  subscription: { select: { id: true, number: true, plan: { select: { name: true, billingPeriod: true, billingInterval: true } } } },
  lines: { orderBy: { id: "asc" as const } },
  discounts: { include: { discount: { select: { id: true, code: true, name: true } } } },
  payments: { orderBy: { paidOn: "asc" as const }, include: { recordedBy: { select: { name: true } } } },
  billingRun: { select: { id: true, trigger: true, startedAt: true } },
} satisfies Prisma.InvoiceInclude;

const money = (minor: number) => `₹${(minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function isOverdue(inv: { status: InvoiceStatus; dueDate: Date }, on = today()) {
  return inv.status === "CONFIRMED" && inv.dueDate < on;
}

export async function getInvoice(id: number, customerId?: number) {
  const [inv, timeline] = await Promise.all([
    prisma.invoice.findUnique({ relationLoadStrategy: "join", where: { id }, include: detailInclude }),
    prisma.activityLog.findMany({
      relationLoadStrategy: "join",
      where: { entityType: "invoice", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { user: { select: { name: true, role: true } } },
    }),
  ]);
  // Customers only ever see their own invoices; others look like they don't exist.
  if (!inv || (customerId !== undefined && inv.customerId !== customerId)) throw notFound("Invoice");
  return { ...inv, overdue: isOverdue(inv), outstanding: inv.status === "CANCELLED" ? 0 : inv.total - inv.amountPaid, timeline };
}

export type InvoiceFilter = "DRAFT" | "CONFIRMED" | "PAID" | "CANCELLED" | "OVERDUE";

export async function listInvoices(opts: {
  page: number;
  pageSize: number;
  q?: string;
  status?: InvoiceFilter;
  customerId?: number;
  subscriptionId?: number;
  from?: Date;
  to?: Date;
}) {
  const t = today();
  const base: Prisma.InvoiceWhereInput = {
    ...(opts.customerId ? { customerId: opts.customerId } : {}),
    ...(opts.subscriptionId ? { subscriptionId: opts.subscriptionId } : {}),
    ...(opts.from || opts.to ? { issueDate: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } } : {}),
    ...(opts.q
      ? { OR: [{ number: { contains: opts.q, mode: "insensitive" } }, { customer: { name: { contains: opts.q, mode: "insensitive" } } }] }
      : {}),
  };
  const statusWhere: Prisma.InvoiceWhereInput =
    opts.status === "OVERDUE" ? { status: "CONFIRMED", dueDate: { lt: t } } : opts.status ? { status: opts.status } : {};
  const where = { ...base, ...statusWhere };

  const [total, data, grouped, overdue] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      relationLoadStrategy: "join",
      where,
      orderBy: [{ issueDate: "desc" }, { id: "desc" }],
      select: {
        id: true,
        number: true,
        status: true,
        issueDate: true,
        dueDate: true,
        periodStart: true,
        periodEnd: true,
        total: true,
        amountPaid: true,
        sentAt: true,
        customer: { select: { id: true, name: true } },
        subscription: { select: { id: true, number: true } },
      },
      ...paging(opts.page, opts.pageSize),
    }),
    prisma.invoice.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
    prisma.invoice.count({ where: { ...base, status: "CONFIRMED", dueDate: { lt: t } } }),
  ]);
  const counts: Record<string, number> = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
  counts.OVERDUE = overdue;
  return {
    data: data.map((i) => ({ ...i, overdue: isOverdue(i, t) })),
    page: opts.page,
    pageSize: opts.pageSize,
    total,
    counts,
  };
}

/** Compare-and-set on status: the transition happens only if the invoice is still in an expected state. */
async function casStatus(tx: Prisma.TransactionClient, id: number, from: InvoiceStatus[], data: Prisma.InvoiceUpdateManyMutationInput, extraWhere: Prisma.InvoiceWhereInput = {}) {
  const { count } = await tx.invoice.updateMany({ where: { id, status: { in: from }, ...extraWhere }, data });
  if (count === 0) throw conflict("This invoice was changed by someone else. Reload and try again.", "STALE_STATE");
}

export async function confirmInvoice(id: number, userId: number) {
  const inv = await prisma.invoice.findUnique({ where: { id }, select: { status: true } });
  if (!inv) throw notFound("Invoice");
  if (inv.status !== "DRAFT") throw conflict(`Only draft invoices can be confirmed (this one is ${inv.status.toLowerCase()})`, "INVALID_TRANSITION");
  await prisma.$transaction(async (tx) => {
    await casStatus(tx, id, ["DRAFT"], { status: "CONFIRMED" });
    await logActivity(tx, { entityType: "invoice", entityId: id, action: "confirm", fromStatus: "DRAFT", toStatus: "CONFIRMED", userId });
  });
  return getInvoice(id);
}

/** Confirms many drafts in one statement — for billing day, when hundreds are generated at once. */
export async function confirmMany(ids: number[], userId: number) {
  const drafts = await prisma.invoice.findMany({ where: { id: { in: ids }, status: "DRAFT" }, select: { id: true } });
  const draftIds = drafts.map((d) => d.id);
  if (draftIds.length === 0) return { confirmed: 0, skipped: ids.length };
  const confirmed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.invoice.updateMany({ where: { id: { in: draftIds }, status: "DRAFT" }, data: { status: "CONFIRMED" } });
    await tx.activityLog.createMany({
      data: draftIds.map((id) => ({ entityType: "invoice", entityId: id, action: "confirm", fromStatus: "DRAFT", toStatus: "CONFIRMED", userId, meta: { bulk: true } })),
    });
    return count;
  });
  return { confirmed, skipped: ids.length - confirmed };
}

/**
 * Cancels an unpaid invoice: releases the discount uses it consumed and, if it was the
 * subscription's latest period, rewinds the billing cursor so the period is billed again.
 */
export async function cancelInvoice(id: number, userId: number, reason?: string) {
  const inv = await prisma.invoice.findUnique({
    relationLoadStrategy: "join",
    where: { id },
    include: { discounts: true, subscription: { select: { id: true, nextBillingDate: true, status: true } } },
  });
  if (!inv) throw notFound("Invoice");
  if (inv.status === "CANCELLED" || inv.status === "PAID") throw conflict(`A ${inv.status.toLowerCase()} invoice cannot be cancelled`, "INVALID_TRANSITION");
  if (inv.amountPaid > 0) throw businessRule("This invoice has payments recorded against it and cannot be cancelled");

  const rebill = inv.subscription.nextBillingDate?.getTime() === inv.periodEnd.getTime() && inv.subscription.status !== "CLOSED";
  await prisma.$transaction(async (tx) => {
    await casStatus(tx, id, ["DRAFT", "CONFIRMED"], { status: "CANCELLED" }, { amountPaid: 0 });
    for (const d of inv.discounts) {
      await tx.$executeRaw`UPDATE discounts SET usage_count = GREATEST(usage_count - 1, 0), updated_at = now() WHERE id = ${d.discountId}`;
    }
    if (rebill) {
      await tx.subscription.updateMany({
        where: { id: inv.subscriptionId, nextBillingDate: inv.periodEnd },
        data: { nextBillingDate: inv.periodStart, version: { increment: 1 } },
      });
    }
    await logActivity(tx, {
      entityType: "invoice",
      entityId: id,
      action: "cancel",
      fromStatus: inv.status,
      toStatus: "CANCELLED",
      userId,
      meta: { reason: reason ?? null, rebill, releasedDiscounts: inv.discounts.length },
    });
  });
  return getInvoice(id);
}

export async function sendInvoice(id: number, userId: number) {
  const inv = await getInvoice(id);
  if (inv.status === "DRAFT") throw businessRule("Confirm the invoice before sending it");
  if (inv.status === "CANCELLED") throw businessRule("A cancelled invoice cannot be sent");

  const lines = inv.lines.map((l) => `  ${l.description} — ${l.quantity} × ${money(l.unitPrice)} = ${money(l.lineTotal)}`).join("\n");
  const delivered = await sendMail({
    to: inv.customer.email,
    kind: "invoice",
    subject: `Invoice ${inv.number} from Brightloop — ${money(inv.total)} due ${isoDate(inv.dueDate)}`,
    text: [
      `Hello ${inv.customer.name},`,
      "",
      `Invoice ${inv.number} for ${isoDate(inv.periodStart)} to ${isoDate(addDays(inv.periodEnd, -1))}:`,
      lines,
      "",
      `Subtotal ${money(inv.subtotal)}${inv.discountTotal ? `, discounts −${money(inv.discountTotal)}` : ""}, tax ${money(inv.taxTotal)}`,
      `Total ${money(inv.total)} · Outstanding ${money(inv.outstanding)} · Due ${isoDate(inv.dueDate)}`,
      "",
      `View and pay: ${env.CLIENT_URL}/portal/invoices/${inv.id}`,
    ].join("\n"),
  });
  if (!delivered) throw new AppError(502, "EMAIL_FAILED", "The email could not be delivered. The invoice was not marked as sent; try again.");

  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id }, data: { sentAt: new Date() } });
    await logActivity(tx, { entityType: "invoice", entityId: id, action: "send", userId, meta: { to: inv.customer.email } });
  });
  return getInvoice(id);
}
