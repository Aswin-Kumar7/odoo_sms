// Runs against a live API with the demo seed loaded. Creates its own test records:
// use a separate database, or run `npm run db:reset-demo -- --yes` afterwards.
// API integration checks for the dashboard reports.
import { call, ok, day, login } from "./helpers.mjs";
const today = day(0);
const tag = Date.now().toString(36).toUpperCase().slice(-5);

await login("admin", "staff", "cust");

let r = await call("cust", "GET", "/reports/summary");
ok("customer cannot read reports", r.status === 403);
r = await call("staff", "GET", "/reports/summary?from=2026-05-01&to=2026-04-01");
ok("end before start → 400", r.status === 400);
r = await call("staff", "GET", "/reports/summary");
ok("summary defaults to the current month", r.status === 200 && r.body.range.from === `${today.slice(0, 7)}-01` && r.body.range.to === today, JSON.stringify(r.body?.range));

// ── Figures agree with the list endpoints
const [summary, overdueList, subs] = await Promise.all([
  call("staff", "GET", "/reports/summary").then((x) => x.body),
  call("staff", "GET", "/invoices?status=OVERDUE&pageSize=1").then((x) => x.body),
  call("staff", "GET", "/subscriptions?pageSize=1").then((x) => x.body),
]);
ok("overdue count = overdue invoice list total", summary.overdue.count === overdueList.total, `${summary.overdue.count} vs ${overdueList.total}`);
ok("draft count = draft tab count", summary.draftInvoices === overdueList.counts.DRAFT, `${summary.draftInvoices} vs ${overdueList.counts.DRAFT}`);
ok("active subscriptions = subscriptions tab count", summary.subscriptions.active === subs.counts.ACTIVE, `${summary.subscriptions.active} vs ${subs.counts.ACTIVE}`);
ok("ARR = MRR × 12", summary.arr === summary.mrr * 12);

// ── MRR normalisation: a quarterly subscription adds a third of its value, a yearly one a twelfth
const products = (await call("staff", "GET", "/products?pageSize=50")).body.data;
const support = products.find((p) => p.name === "Support Plus");
const plans = (await call("staff", "GET", "/plans")).body.data;
const quarterly = plans.find((p) => p.name === "Quarterly");
const yearly = plans.find((p) => p.name === "Yearly");
const cust = (await call("staff", "POST", "/customers", { name: `Reports Test ${tag}`, email: `reports-${tag.toLowerCase()}@test.test` })).body;
async function activate(planId) {
  let s = (await call("staff", "POST", "/subscriptions", { customerId: cust.id, planId, startDate: today, lines: [{ productId: support.id, quantity: 4, unitPrice: 120000 }] })).body;
  for (const a of ["send_quote", "confirm", "activate"]) s = (await call("staff", "POST", `/subscriptions/${s.id}/${a}`, {})).body;
  return s;
}
const mrrOf = async (planId) => (await call("staff", "GET", `/reports/summary?planId=${planId}`)).body.mrr;
const q0 = await mrrOf(quarterly.id);
const y0 = await mrrOf(yearly.id);
const qs = await activate(quarterly.id);
await activate(yearly.id);
const q1 = await mrrOf(quarterly.id);
const y1 = await mrrOf(yearly.id);
// 4 × ₹1,200 = ₹4,800 per period → quarterly ₹1,600/month, yearly ₹400/month (cache cleared by the activations)
ok("quarterly subscription adds value ÷ 3 to MRR", q1 - q0 === 160000, `${q1 - q0}`);
ok("yearly subscription adds value ÷ 12 to MRR", y1 - y0 === 40000, `${y1 - y0}`);

// ── Payments flow into the numbers immediately (cache invalidated on write)
await call("admin", "POST", "/billing/run", { asOf: today });
const inv = (await call("staff", "GET", `/invoices?subscriptionId=${qs.id}`)).body.data[0];
await call("staff", "POST", `/invoices/${inv.id}/confirm`);
const before = (await call("staff", "GET", "/reports/summary")).body;
r = await call("staff", "POST", `/invoices/${inv.id}/payments`, { method: "UPI", amount: 12345, paidOn: today });
ok("payment recorded", r.status === 201);
const after = (await call("staff", "GET", "/reports/summary")).body;
ok("collected rises by the payment", after.collected.amount - before.collected.amount === 12345, `${after.collected.amount - before.collected.amount}`);
ok("outstanding falls by the payment", before.outstanding.amount - after.outstanding.amount === 12345, `${before.outstanding.amount - after.outstanding.amount}`);
const upi = (s) => s.paymentsByMethod.find((m) => m.method === "UPI")?.amount ?? 0;
ok("payments by method updated", upi(after) - upi(before) === 12345);

// ── Trend
r = await call("staff", "GET", "/reports/revenue-trend");
ok("trend has 12 ascending months ending this month", r.body.length === 12 && r.body[11].month === today.slice(0, 7) && r.body.every((m, i, a) => i === 0 || a[i - 1].month < m.month));
ok("trend includes this month's payment", r.body[11].collected >= 12345);
r = await call("staff", "GET", `/reports/revenue-trend?months=3&planId=${quarterly.id}`);
ok("trend months + plan filter", r.status === 200 && r.body.length === 3);
r = await call("staff", "GET", "/reports/revenue-trend?months=99");
ok("trend months capped", r.status === 400);
