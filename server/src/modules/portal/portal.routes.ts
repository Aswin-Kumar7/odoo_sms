import { Router } from "express";
import { z } from "zod";
import { ah, IdParam, PageQuery } from "../../lib/http.js";
import { notFound } from "../../lib/errors.js";
import { today } from "../../lib/dates.js";
import { requireRole } from "../../middleware/auth.js";
import * as subs from "../subscriptions/subscriptions.service.js";
import * as invoices from "../invoices/invoices.service.js";
import { recordPayment } from "../payments/payments.service.js";
import type { Action } from "../subscriptions/stateMachine.js";

// Customer self-service. The customer id always comes from the verified session, never from
// the request, and anything that isn't theirs (or is still an internal draft) is a 404.

export const portalRouter = Router();
portalRouter.use(requireRole("CUSTOMER"));

function customerIdOf(req: { user?: { customerId: number | null } }) {
  const id = req.user?.customerId;
  if (!id) throw notFound("Customer account");
  return id;
}

type TimelineEntry = { user: { name: string; role: string } | null };
type InvoiceRow = { status: string };

/** Hides internal details: staff names on the timeline, internal notes and draft invoices. */
function forCustomer<T extends { timeline?: TimelineEntry[]; invoices?: InvoiceRow[]; notes?: string | null; createdBy?: unknown }>(sub: T) {
  const { notes: _notes, createdBy: _createdBy, ...rest } = sub;
  return {
    ...rest,
    invoices: sub.invoices?.filter((i) => i.status !== "DRAFT"),
    timeline: sub.timeline?.map((t) => ({ ...t, user: t.user && t.user.role !== "CUSTOMER" ? { name: "Brightloop team", role: "STAFF" } : t.user })),
  };
}

portalRouter.get(
  "/subscriptions",
  ah(async (req, res) => {
    const data = await subs.listCustomerSubscriptions(customerIdOf(req));
    res.json({ data: data.map(forCustomer) });
  }),
);

async function ownSubscription(id: number, customerId: number) {
  const sub = await subs.getSubscription(id, "customer", customerId);
  if (sub.status === "DRAFT") throw notFound("Subscription");
  return sub;
}

portalRouter.get(
  "/subscriptions/:id",
  ah(async (req, res) => {
    res.json(forCustomer(await ownSubscription(IdParam.parse(req.params).id, customerIdOf(req))));
  }),
);

const SELF_SERVICE = ["pause", "resume", "close", "renew"] as const;

portalRouter.post(
  "/subscriptions/:id/:action",
  ah(async (req, res) => {
    const { id, action } = IdParam.extend({ action: z.enum(SELF_SERVICE) }).parse(req.params);
    const { version, reason } = z.object({ version: z.number().int().min(0).optional(), reason: z.string().trim().max(300).optional() }).parse(req.body ?? {});
    const customerId = customerIdOf(req);
    await ownSubscription(id, customerId);
    const sub = await subs.transition(id, action as Action, {
      userId: req.user!.id,
      actor: "customer",
      customerId,
      version,
      reason: action === "close" ? reason ?? "Closed by the customer" : reason,
    });
    res.json(forCustomer(sub));
  }),
);

const InvoiceQuery = PageQuery.extend({ status: z.enum(["CONFIRMED", "PAID", "CANCELLED", "OVERDUE"]).optional() });

portalRouter.get(
  "/invoices",
  ah(async (req, res) => {
    const q = InvoiceQuery.parse(req.query);
    const customerId = customerIdOf(req);
    const [list, outstanding] = await Promise.all([
      invoices.listInvoices({ ...q, customerId, hideDrafts: true }),
      invoices.outstandingFor(customerId),
    ]);
    res.json({ ...list, outstanding });
  }),
);

portalRouter.get(
  "/invoices/:id",
  ah(async (req, res) => {
    const { timeline: _timeline, billingRun: _run, ...inv } = await invoices.getInvoice(IdParam.parse(req.params).id, customerIdOf(req));
    res.json({ ...inv, payments: inv.payments.map((p) => ({ ...p, recordedBy: null })) });
  }),
);

// Simulated online payment: goes through exactly the same locked, overpayment-guarded path
// as a payment recorded by staff. Pays the full outstanding amount unless told otherwise.
portalRouter.post(
  "/invoices/:id/pay",
  ah(async (req, res) => {
    const { id } = IdParam.parse(req.params);
    const { amount } = z.object({ amount: z.number().int().positive().optional() }).parse(req.body ?? {});
    const customerId = customerIdOf(req);
    const current = await invoices.getInvoice(id, customerId);
    const { invoice, paymentId } = await recordPayment(
      id,
      { method: "ONLINE_SIMULATED", amount: amount ?? current.outstanding, paidOn: today(), note: "Paid online via the customer portal" },
      req.user!.id,
      customerId,
    );
    const { timeline: _timeline, billingRun: _run, ...inv } = invoice;
    res.status(201).json({ paymentId, invoice: { ...inv, payments: inv.payments.map((p) => ({ ...p, recordedBy: null })) } });
  }),
);
