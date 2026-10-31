import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { addDays, isoDate, today } from "../../lib/dates.js";
import { cached } from "../../lib/cache.js";

// Finance reporting. Every figure is an aggregate computed by Postgres (COUNT/SUM with
// FILTER), never by loading rows into the API, and the independent queries run in parallel
// so the page costs one round trip of latency. Results are cached for 30 s and the cache is
// cleared by any write that changes these numbers.

export interface ReportFilter {
  from: Date; // inclusive
  to: Date; // inclusive
  planId?: number;
}

const n = (v: bigint | number | string | null | undefined) => Number(v ?? 0);

/** Monthly equivalent of one billing period: yearly ÷ 12, weekly × 52 ÷ 12, daily × 365 ÷ 12, then ÷ interval. */
const MONTHLY_FACTOR_SQL = Prisma.sql`(CASE p.billing_period WHEN 'DAILY' THEN 365.0 / 12 WHEN 'WEEKLY' THEN 52.0 / 12 WHEN 'MONTHLY' THEN 1.0 ELSE 1.0 / 12 END / p.billing_interval)`;

export function summary(f: ReportFilter) {
  return cached(`summary:${isoDate(f.from)}:${isoDate(f.to)}:${f.planId ?? ""}`, () => computeSummary(f));
}

async function computeSummary({ from, to, planId }: ReportFilter) {
  const t = today();
  const toExclusive = addDays(to, 1);
  const plan = planId ? Prisma.sql`AND s.plan_id = ${planId}` : Prisma.empty;

  const [byStatus, [recurring], [inv], payments, overdueList] = await Promise.all([
    prisma.$queryRaw<{ status: string; count: bigint; created: bigint; closed: bigint }[]>`
      SELECT s.status::text AS status, COUNT(*) AS count,
             COUNT(*) FILTER (WHERE s.created_at >= ${from} AND s.created_at < ${toExclusive}) AS created,
             COUNT(*) FILTER (WHERE s.closed_at >= ${from} AND s.closed_at < ${toExclusive}) AS closed
      FROM subscriptions s WHERE TRUE ${plan} GROUP BY s.status`,

    // MRR: recurring value of active subscriptions (plan fee + product lines, before tax and
    // limited-time discounts), normalised to a month.
    prisma.$queryRaw<{ mrr: number | null; active: bigint }[]>`
      SELECT SUM((p.price + COALESCE(l.amount, 0)) * ${MONTHLY_FACTOR_SQL})::float8 AS mrr, COUNT(*) AS active
      FROM subscriptions s
      JOIN recurring_plans p ON p.id = s.plan_id
      LEFT JOIN (SELECT subscription_id, SUM(quantity::bigint * unit_price) AS amount FROM subscription_lines GROUP BY subscription_id) l
        ON l.subscription_id = s.id
      WHERE s.status = 'ACTIVE' ${plan}`,

    prisma.$queryRaw<
      { invoiced: bigint | null; invoiced_count: bigint; outstanding: bigint | null; outstanding_count: bigint; overdue: bigint | null; overdue_count: bigint; drafts: bigint }[]
    >`
      SELECT SUM(i.total) FILTER (WHERE i.status IN ('CONFIRMED', 'PAID') AND i.issue_date >= ${from} AND i.issue_date <= ${to}) AS invoiced,
             COUNT(*) FILTER (WHERE i.status IN ('CONFIRMED', 'PAID') AND i.issue_date >= ${from} AND i.issue_date <= ${to}) AS invoiced_count,
             SUM(i.total - i.amount_paid) FILTER (WHERE i.status = 'CONFIRMED') AS outstanding,
             COUNT(*) FILTER (WHERE i.status = 'CONFIRMED') AS outstanding_count,
             SUM(i.total - i.amount_paid) FILTER (WHERE i.status = 'CONFIRMED' AND i.due_date < ${t}) AS overdue,
             COUNT(*) FILTER (WHERE i.status = 'CONFIRMED' AND i.due_date < ${t}) AS overdue_count,
             COUNT(*) FILTER (WHERE i.status = 'DRAFT') AS drafts
      FROM invoices i JOIN subscriptions s ON s.id = i.subscription_id
      WHERE TRUE ${plan}`,

    prisma.$queryRaw<{ method: string; count: bigint; amount: bigint }[]>`
      SELECT pm.method::text AS method, COUNT(*) AS count, SUM(pm.amount) AS amount
      FROM payments pm
      JOIN invoices i ON i.id = pm.invoice_id
      JOIN subscriptions s ON s.id = i.subscription_id
      WHERE pm.paid_on >= ${from} AND pm.paid_on <= ${to} ${plan}
      GROUP BY pm.method ORDER BY amount DESC`,

    prisma.invoice.findMany({
      relationLoadStrategy: "join",
      where: { status: "CONFIRMED", dueDate: { lt: t }, ...(planId ? { subscription: { planId } } : {}) },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: 8,
      select: { id: true, number: true, dueDate: true, total: true, amountPaid: true, customer: { select: { id: true, name: true } } },
    }),
  ]);

  const statusCounts = Object.fromEntries(byStatus.map((r) => [r.status, n(r.count)]));
  const mrr = Math.round(recurring?.mrr ?? 0);
  const collected = payments.reduce((a, p) => a + n(p.amount), 0);
  return {
    range: { from: isoDate(from), to: isoDate(to) },
    subscriptions: {
      active: n(recurring?.active),
      byStatus: statusCounts,
      total: byStatus.reduce((a, r) => a + n(r.count), 0),
      createdInRange: byStatus.reduce((a, r) => a + n(r.created), 0),
      closedInRange: byStatus.reduce((a, r) => a + n(r.closed), 0),
    },
    mrr,
    arr: mrr * 12,
    invoiced: { amount: n(inv?.invoiced), count: n(inv?.invoiced_count) },
    collected: { amount: collected, count: payments.reduce((a, p) => a + n(p.count), 0) },
    outstanding: { amount: n(inv?.outstanding), count: n(inv?.outstanding_count) },
    overdue: { amount: n(inv?.overdue), count: n(inv?.overdue_count) },
    draftInvoices: n(inv?.drafts),
    paymentsByMethod: payments.map((p) => ({ method: p.method, count: n(p.count), amount: n(p.amount) })),
    topOverdue: overdueList.map((i) => ({ ...i, outstanding: i.total - i.amountPaid, daysOverdue: Math.round((t.getTime() - i.dueDate.getTime()) / 86_400_000) })),
  };
}

/** Invoiced vs collected per calendar month for the last `months` months (current month included). */
export function revenueTrend(months: number, planId?: number) {
  return cached(`trend:${isoDate(today())}:${months}:${planId ?? ""}`, async () => {
    const t = today();
    const plan = planId ? Prisma.sql`AND s.plan_id = ${planId}` : Prisma.empty;
    const rows = await prisma.$queryRaw<{ month: Date; invoiced: bigint; collected: bigint }[]>`
      WITH m AS (
        SELECT generate_series(date_trunc('month', ${t}::date) - make_interval(months => ${months - 1}::int), date_trunc('month', ${t}::date), interval '1 month')::date AS month
      ),
      inv AS (
        SELECT date_trunc('month', i.issue_date)::date AS month, SUM(i.total) AS amount
        FROM invoices i JOIN subscriptions s ON s.id = i.subscription_id
        WHERE i.status IN ('CONFIRMED', 'PAID') AND i.issue_date >= (SELECT MIN(month) FROM m) ${plan}
        GROUP BY 1
      ),
      pay AS (
        SELECT date_trunc('month', pm.paid_on)::date AS month, SUM(pm.amount) AS amount
        FROM payments pm JOIN invoices i ON i.id = pm.invoice_id JOIN subscriptions s ON s.id = i.subscription_id
        WHERE pm.paid_on >= (SELECT MIN(month) FROM m) ${plan}
        GROUP BY 1
      )
      SELECT m.month, COALESCE(inv.amount, 0) AS invoiced, COALESCE(pay.amount, 0) AS collected
      FROM m LEFT JOIN inv USING (month) LEFT JOIN pay USING (month)
      ORDER BY m.month`;
    return rows.map((r) => ({ month: isoDate(r.month).slice(0, 7), invoiced: n(r.invoiced), collected: n(r.collected) }));
  });
}
