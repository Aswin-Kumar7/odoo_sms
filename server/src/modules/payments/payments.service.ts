import { Prisma, type PaymentMethod } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { businessRule, conflict, notFound } from "../../lib/errors.js";
import { paging } from "../../lib/http.js";
import { isoDate, today } from "../../lib/dates.js";
import { logActivity } from "../../lib/activity.js";
import { invalidateReports } from "../../lib/cache.js";
import { getInvoice } from "../invoices/invoices.service.js";

export interface PaymentInput {
  method: PaymentMethod;
  amount: number; // minor units
  paidOn: Date;
  note?: string | null;
}

interface LockedInvoice {
  id: number;
  status: string;
  total: number;
  amount_paid: number;
  customer_id: number;
}

/**
 * Records a payment against a confirmed invoice.
 *
 * The invoice row is locked (SELECT … FOR UPDATE) for the whole transaction, so two people
 * paying the same invoice at once are serialised: the second one re-reads the outstanding
 * amount after the first commits and is refused if it would overpay. The CHECK constraint
 * amount_paid <= total backs this up in the database.
 */
export async function recordPayment(invoiceId: number, input: PaymentInput, userId: number, customerId?: number) {
  if (input.paidOn > today()) throw businessRule("The payment date cannot be in the future");

  const result = await prisma.$transaction(async (tx) => {
    const [inv] = await tx.$queryRaw<LockedInvoice[]>`
      SELECT id, status::text AS status, total, amount_paid, customer_id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`;
    // Customers only ever see their own invoices; others look like they don't exist.
    if (!inv || (customerId !== undefined && inv.customer_id !== customerId)) throw notFound("Invoice");
    if (inv.status === "PAID") throw conflict("This invoice is already fully paid", "INVALID_TRANSITION");
    if (inv.status !== "CONFIRMED") throw businessRule(`Payments can only be recorded on confirmed invoices (this one is ${inv.status.toLowerCase()})`);

    const outstanding = inv.total - inv.amount_paid;
    if (input.amount > outstanding) {
      throw businessRule(`The amount exceeds the outstanding balance of ₹${(outstanding / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, { outstanding });
    }

    const paidInFull = input.amount === outstanding;
    const payment = await tx.payment.create({
      data: { invoiceId, method: input.method, amount: input.amount, paidOn: input.paidOn, note: input.note ?? null, recordedById: userId },
      select: { id: true },
    });
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { amountPaid: { increment: input.amount }, ...(paidInFull ? { status: "PAID" } : {}) },
    });
    await logActivity(tx, {
      entityType: "invoice",
      entityId: invoiceId,
      action: "payment",
      fromStatus: paidInFull ? "CONFIRMED" : null,
      toStatus: paidInFull ? "PAID" : null,
      userId,
      meta: { paymentId: payment.id, amount: input.amount, method: input.method, paidOn: isoDate(input.paidOn) },
    });
    return payment.id;
  });

  invalidateReports();
  return { paymentId: result, invoice: await getInvoice(invoiceId, customerId) };
}

export async function listPayments(opts: {
  page: number;
  pageSize: number;
  q?: string;
  method?: PaymentMethod;
  customerId?: number;
  from?: Date;
  to?: Date;
}) {
  const where: Prisma.PaymentWhereInput = {
    ...(opts.method ? { method: opts.method } : {}),
    ...(opts.customerId ? { invoice: { customerId: opts.customerId } } : {}),
    ...(opts.from || opts.to ? { paidOn: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } } : {}),
    ...(opts.q
      ? {
          OR: [
            { invoice: { number: { contains: opts.q, mode: "insensitive" } } },
            { invoice: { customer: { name: { contains: opts.q, mode: "insensitive" } } } },
            { note: { contains: opts.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [total, data, byMethod] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      relationLoadStrategy: "join",
      where,
      orderBy: [{ paidOn: "desc" }, { id: "desc" }],
      select: {
        id: true,
        method: true,
        amount: true,
        paidOn: true,
        note: true,
        createdAt: true,
        recordedBy: { select: { name: true, role: true } },
        invoice: { select: { id: true, number: true, status: true, customer: { select: { id: true, name: true } } } },
      },
      ...paging(opts.page, opts.pageSize),
    }),
    prisma.payment.groupBy({ by: ["method"], where, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  const summary = {
    count: byMethod.reduce((n, g) => n + g._count._all, 0),
    amount: byMethod.reduce((n, g) => n + (g._sum.amount ?? 0), 0),
    byMethod: byMethod.map((g) => ({ method: g.method, count: g._count._all, amount: g._sum.amount ?? 0 })).sort((a, b) => b.amount - a.amount),
  };
  return { data, page: opts.page, pageSize: opts.pageSize, total, summary };
}
