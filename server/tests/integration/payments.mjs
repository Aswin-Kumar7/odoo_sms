// Runs against a live API with the demo seed loaded. Creates its own test records:
// use a separate database, or run `npm run db:reset-demo -- --yes` afterwards.
// API integration checks for payments and the customer portal.
import { call, ok, day, login } from "./helpers.mjs";
const today = day(0);
const tag = Date.now().toString(36).toUpperCase().slice(-5);

await login("admin", "staff", "cust");

// A fresh customer signs up for the portal; the seeded demo customer plays "someone else".
let r = await call("portalA", "POST", "/auth/signup", { name: `Portal Tester ${tag}`, email: `portal-${tag.toLowerCase()}@test.test`, password: "Portal@12345" });
ok("customer signs up", r.status === 201 && r.body.user?.customerId, r.status);
const customerId = r.body.user.customerId;

const products = (await call("staff", "GET", "/products?pageSize=50")).body.data;
const support = products.find((p) => p.name === "Support Plus");
const plans = (await call("staff", "GET", "/plans")).body.data;
const monthly = plans.find((p) => p.name === "Monthly");
const yearly = plans.find((p) => p.name === "Yearly");

async function activeSub(planId, startDate) {
  let s = (await call("staff", "POST", "/subscriptions", { customerId, planId, startDate, lines: [{ productId: support.id, quantity: 1 }] })).body;
  for (const a of ["send_quote", "confirm", "activate"]) s = (await call("staff", "POST", `/subscriptions/${s.id}/${a}`, {})).body;
  return s;
}
const mon = await activeSub(monthly.id, today);
const late = await activeSub(monthly.id, day(-40)); // two periods due → two invoices, the first overdue once confirmed
const yr = await activeSub(yearly.id, today);
const draft = (await call("staff", "POST", "/subscriptions", { customerId, planId: monthly.id, startDate: today, lines: [{ productId: support.id, quantity: 1 }] })).body;

r = await call("admin", "POST", "/billing/run", { asOf: today });
ok("billing run for setup", r.status === 200, r.body?.createdCount);
const invoicesOf = async (subId) => (await call("staff", "GET", `/invoices?subscriptionId=${subId}`)).body.data.sort((a, b) => a.periodStart.localeCompare(b.periodStart));
const [inv] = await invoicesOf(mon.id);
const lateInv = await invoicesOf(late.id);
ok("setup: invoices generated", inv && lateInv.length === 2);

// ── Portal hides drafts
r = await call("portalA", "GET", "/portal/invoices");
ok("draft invoices hidden from the customer", r.status === 200 && r.body.total === 0, r.body?.total);
r = await call("portalA", "GET", `/portal/invoices/${inv.id}`);
ok("draft invoice detail → 404 for the customer", r.status === 404);
r = await call("portalA", "GET", "/portal/subscriptions");
ok("portal lists own subscriptions, drafts hidden", r.status === 200 && r.body.data.length === 3 && !r.body.data.some((s) => s.id === draft.id), r.body?.data?.length);

// ── Staff payments
r = await call("staff", "POST", `/invoices/${inv.id}/payments`, { method: "UPI", amount: 1000, paidOn: today });
ok("payment on a draft invoice refused", r.status === 422, r.body?.error?.message);
await call("staff", "POST", "/invoices/confirm-bulk", { ids: [inv.id, ...lateInv.map((i) => i.id)] });
const total = (await call("staff", "GET", `/invoices/${inv.id}`)).body.total;

r = await call("staff", "POST", `/invoices/${inv.id}/payments`, { method: "ONLINE_SIMULATED", amount: 1000, paidOn: today });
ok("staff cannot use the simulated online method", r.status === 400);
r = await call("staff", "POST", `/invoices/${inv.id}/payments`, { method: "UPI", amount: 1000, paidOn: day(2) });
ok("future payment date refused", r.status === 422);
r = await call("staff", "POST", `/invoices/${inv.id}/payments`, { method: "UPI", amount: total + 1, paidOn: today });
ok("overpayment refused (422)", r.status === 422 && r.body.error.details?.outstanding === total, r.body?.error?.message);
r = await call("staff", "POST", `/invoices/${inv.id}/payments`, { method: "UPI", amount: 0, paidOn: today });
ok("zero amount refused", r.status === 400);

r = await call("staff", "POST", `/invoices/${inv.id}/payments`, { method: "CASH", amount: 10000, paidOn: today, note: "Part payment at the counter" });
ok("partial payment keeps invoice confirmed", r.status === 201 && r.body.invoice.status === "CONFIRMED" && r.body.invoice.outstanding === total - 10000, r.body?.invoice?.status);
const rest = total - 10000;

const [p1, p2] = await Promise.all([
  call("staff", "POST", `/invoices/${inv.id}/payments`, { method: "BANK_TRANSFER", amount: rest, paidOn: today, note: "NEFT 1" }),
  call("admin", "POST", `/invoices/${inv.id}/payments`, { method: "BANK_TRANSFER", amount: rest, paidOn: today, note: "NEFT 2" }),
]);
const ps = [p1.status, p2.status].sort();
ok("two simultaneous full payments: exactly one succeeds", ps[0] === 201 && (ps[1] === 409 || ps[1] === 422), ps.join(","));
const paid = (await call("staff", "GET", `/invoices/${inv.id}`)).body;
ok("invoice is PAID with amount paid = total", paid.status === "PAID" && paid.amountPaid === total && paid.outstanding === 0, `${paid.status} ${paid.amountPaid}/${total}`);
ok("payment recorded on the timeline", paid.timeline.some((t) => t.action === "payment" && t.toStatus === "PAID"));
r = await call("staff", "POST", `/invoices/${inv.id}/payments`, { method: "CASH", amount: 1, paidOn: today });
ok("payment on a paid invoice → 409", r.status === 409);
r = await call("staff", "POST", `/invoices/${inv.id}/cancel`, {});
ok("paid invoice cannot be cancelled", r.status === 409);
r = await call("staff", "GET", `/invoices/${inv.id}/payments`);
ok("invoice payments endpoint lists 2", r.status === 200 && r.body.length === 2);
r = await call("staff", "GET", `/payments?customerId=${customerId}`);
ok("payments list + summary", r.status === 200 && r.body.total === 2 && r.body.summary.amount === total, JSON.stringify(r.body?.summary));
r = await call("staff", "GET", `/payments?method=CASH&customerId=${customerId}`);
ok("payments filter by method", r.body.data.length === 1 && r.body.data[0].method === "CASH");

// ── Isolation between customers
r = await call("cust", "GET", `/portal/invoices/${lateInv[0].id}`);
ok("another customer cannot read the invoice (404)", r.status === 404);
r = await call("cust", "POST", `/portal/invoices/${lateInv[0].id}/pay`, {});
ok("another customer cannot pay it (404)", r.status === 404);
r = await call("cust", "GET", `/portal/subscriptions/${mon.id}`);
ok("another customer cannot read the subscription (404)", r.status === 404);
r = await call("cust", "POST", `/portal/subscriptions/${mon.id}/pause`, {});
ok("another customer cannot pause it (404)", r.status === 404);
r = await call("portalA", "GET", `/portal/subscriptions/${draft.id}`);
ok("own draft subscription hidden (404)", r.status === 404);
r = await call("staff", "GET", "/portal/subscriptions");
ok("staff cannot use portal endpoints", r.status === 403);
r = await call("portalA", "GET", "/payments");
ok("customer cannot list all payments", r.status === 403);
r = await call("portalA", "GET", `/invoices/${inv.id}`);
ok("customer cannot use back-office invoice endpoint", r.status === 403);

// ── Portal invoices and simulated payment
r = await call("portalA", "GET", "/portal/invoices");
ok("customer sees confirmed/paid invoices and outstanding totals", r.body.total === 3 && r.body.outstanding.count === 2 && r.body.outstanding.overdue > 0, JSON.stringify(r.body?.outstanding));
r = await call("portalA", "GET", "/portal/invoices?status=OVERDUE");
ok("overdue filter in the portal", r.body.data.length === 1 && r.body.data[0].id === lateInv[0].id);
r = await call("portalA", "GET", `/portal/invoices/${lateInv[0].id}`);
ok("invoice detail without internal timeline", r.status === 200 && r.body.timeline === undefined && r.body.overdue === true);
r = await call("portalA", "POST", `/portal/invoices/${lateInv[0].id}/pay`, { amount: 5000 });
ok("partial online payment", r.status === 201 && r.body.invoice.status === "CONFIRMED" && r.body.invoice.payments[0].method === "ONLINE_SIMULATED", r.status);
r = await call("portalA", "POST", `/portal/invoices/${lateInv[0].id}/pay`, {});
ok("pay the rest → PAID", r.status === 201 && r.body.invoice.status === "PAID" && r.body.invoice.outstanding === 0, r.body?.invoice?.status);
r = await call("portalA", "POST", `/portal/invoices/${lateInv[0].id}/pay`, {});
ok("paying again → 409", r.status === 409);

// ── Portal self-service
r = await call("portalA", "GET", `/portal/subscriptions/${mon.id}`);
ok("subscription detail with customer actions", r.status === 200 && r.body.actions.map((a) => a.action).join(",") === "pause,close,renew" && r.body.createdBy === undefined, r.body?.actions?.map((a) => a.action).join(","));
ok("staff names hidden on the timeline", r.body.timeline.every((t) => !t.user || t.user.name === "Brightloop team" || t.user.role === "CUSTOMER"));
r = await call("portalA", "POST", `/portal/subscriptions/${mon.id}/pause`, {});
ok("customer pauses a pausable plan", r.status === 200 && r.body.status === "PAUSED");
r = await call("portalA", "POST", `/portal/subscriptions/${mon.id}/resume`, {});
ok("customer resumes", r.status === 200 && r.body.status === "ACTIVE");
r = await call("portalA", "POST", `/portal/subscriptions/${yr.id}/pause`, {});
ok("yearly plan cannot be paused (422)", r.status === 422, r.body?.error?.message);
r = await call("portalA", "POST", `/portal/subscriptions/${yr.id}/renew`, {});
ok("customer renews the yearly plan", r.status === 200 && r.body.expiryDate.slice(0, 4) === String(Number(today.slice(0, 4)) + 2));
r = await call("portalA", "POST", `/portal/subscriptions/${mon.id}/cancel`, {});
ok("staff-only action not exposed to customers", r.status === 400);
r = await call("portalA", "POST", `/portal/subscriptions/${mon.id}/close`, {});
ok("customer closes with a default reason", r.status === 200 && r.body.status === "CLOSED" && r.body.closeReason === "Closed by the customer");
