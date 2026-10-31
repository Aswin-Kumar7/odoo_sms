// Runs against a live API with the demo seed loaded. Creates its own test records:
// use a separate database, or run `npm run db:reset-demo -- --yes` afterwards.
// API integration checks for customers, templates and subscriptions.
const B = `${process.env.API_URL ?? "http://localhost:4000"}/api/v1`;
const jar = {};
async function call(who, method, path, body) {
  const res = await fetch(B + path, {
    method,
    headers: { "Content-Type": "application/json", ...(jar[who] ? { Cookie: jar[who] } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = res.headers.get("set-cookie");
  if (sc) jar[who] = sc.split(";")[0];
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
const ok = (label, cond, extra = "") => console.log(`${cond ? "PASS" : "FAIL"} ${label}${extra ? " — " + extra : ""}`);
const today = new Date().toISOString().slice(0, 10);
const future = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);

await call("admin", "POST", "/auth/login", { email: "admin@brightloop.test", password: "Admin@12345" });
await call("staff", "POST", "/auth/login", { email: "staff@brightloop.test", password: "Staff@12345" });
await call("cust", "POST", "/auth/login", { email: "customer@brightloop.test", password: "Customer@123" });

const products = (await call("staff", "GET", "/products?pageSize=50")).body.data;
const crm = products.find((p) => p.name === "Brightloop CRM");
const odoo = crm.variants.find((v) => v.name === "Brand: Odoo");
const support = products.find((p) => p.name === "Support Plus");
const plans = (await call("staff", "GET", "/plans")).body.data;
const monthly = plans.find((p) => p.name === "Monthly");
const yearly = plans.find((p) => p.name === "Yearly");
const annual = plans.find((p) => p.name === "Annual contract (fixed)");

// Customers
let r = await call("staff", "POST", "/customers", { name: "Acme Retail", email: "ACCOUNTS@acme.test", phone: "+91 98450 00000" });
ok("staff creates customer (email lower-cased)", r.status === 201 && r.body.email === "accounts@acme.test", r.status);
const acme = r.body;
r = await call("cust", "GET", "/customers");
ok("customer cannot list customers", r.status === 403);

// Templates
r = await call("staff", "POST", "/templates", { name: "X", planId: monthly.id, validityDays: 14, lines: [] });
ok("staff cannot create template", r.status === 403);
r = await call("admin", "POST", "/templates", { name: "Annual 5", planId: annual.id, validityDays: 14, lines: [{ productId: crm.id, quantity: 5 }] });
ok("template rejects qty below plan minimum (10)", r.status === 422, r.body?.error?.message);
r = await call("admin", "POST", "/templates", { name: "Bad variant", planId: monthly.id, validityDays: 14, lines: [{ productId: support.id, variantId: odoo.id, quantity: 1 }] });
ok("template rejects foreign variant", r.status === 422, r.body?.error?.message);
r = await call("admin", "POST", "/templates", {
  name: `SMB Starter ${Date.now()}`,
  planId: monthly.id,
  validityDays: 14,
  lines: [{ productId: crm.id, variantId: odoo.id, quantity: 3 }, { productId: support.id, quantity: 1 }],
});
ok("admin creates template with 2 lines", r.status === 201 && r.body.lines.length === 2, r.status);
const tpl = r.body;

// Create from template
r = await call("staff", "POST", "/subscriptions", { customerId: acme.id, templateId: tpl.id, startDate: today });
ok("create from template", r.status === 201 && r.body.status === "DRAFT" && /^SUB-\d{6}$/.test(r.body.number), `${r.status} ${r.body?.number}`);
let sub = r.body;
const crmLine = sub.lines.find((l) => l.productId === crm.id);
ok("line price = sales + variant extra (₹2,060)", crmLine.unitPrice === 206000, crmLine.unitPrice);
ok("line description includes variant", crmLine.description === "Brightloop CRM (Brand: Odoo)", crmLine.description);
ok("line tax defaulted from product (GST 18%)", crmLine.tax?.rateBp === 1800);
// 3 × 206000 + 1 × 99900 = 717900; tax 18% = 129222 → total 847122
ok("totals from engine", sub.totals.subtotal === 717900 && sub.totals.taxTotal === 129222 && sub.totals.total === 847122, JSON.stringify({ s: sub.totals.subtotal, t: sub.totals.taxTotal, T: sub.totals.total }));
ok("draft actions = send_quote, cancel", JSON.stringify(sub.actions.map((a) => a.action)) === '["send_quote","cancel"]');
ok("timeline has created", sub.timeline[0]?.action === "created");

// Validation
r = await call("staff", "POST", "/subscriptions", { customerId: acme.id, planId: annual.id, startDate: today, lines: [{ productId: crm.id, quantity: 2 }] });
ok("create rejects qty below plan min", r.status === 422, r.body?.error?.message);
r = await call("staff", "POST", "/subscriptions", { customerId: acme.id, startDate: today });
ok("create requires plan or template", r.status === 400);

// Edit lines with stale version
r = await call("staff", "PUT", `/subscriptions/${sub.id}/lines`, { version: sub.version + 5, lines: [{ productId: crm.id, quantity: 5 }] });
ok("stale version → 409", r.status === 409 && r.body.error.code === "STALE_STATE");
r = await call("staff", "PUT", `/subscriptions/${sub.id}/lines`, {
  version: sub.version,
  lines: [{ productId: crm.id, variantId: odoo.id, quantity: 5 }, { productId: support.id, quantity: 1, unitPrice: 80000, taxId: null }],
});
ok("replace lines (custom price, no tax)", r.status === 200 && r.body.lines.length === 2 && r.body.version === sub.version + 1, r.status);
sub = r.body;
const sp = sub.lines.find((l) => l.productId === support.id);
ok("explicit taxId null → untaxed", sp.taxId === null && sp.unitPrice === 80000);

// Header edit
r = await call("staff", "PATCH", `/subscriptions/${sub.id}`, { version: sub.version, paymentTermDays: 30, expiryDate: today });
ok("expiry must be after start", r.status === 422, r.body?.error?.message);
r = await call("staff", "PATCH", `/subscriptions/${sub.id}`, { version: sub.version, paymentTermDays: 30, notes: "Negotiated support price" });
ok("header update", r.status === 200 && r.body.paymentTermDays === 30);
sub = r.body;

// Transitions
r = await call("staff", "POST", `/subscriptions/${sub.id}/confirm`, { version: sub.version });
ok("confirm from DRAFT → 409 invalid transition", r.status === 409 && r.body.error.code === "INVALID_TRANSITION", r.body?.error?.message);
r = await call("staff", "POST", `/subscriptions/${sub.id}/send_quote`, { version: sub.version });
ok("send quote", r.status === 200 && r.body.status === "QUOTATION" && r.body.quoteExpiresAt, r.body?.quoteExpiresAt);
sub = r.body;
const exp = new Date(Date.parse(today) + 14 * 864e5).toISOString().slice(0, 10);
ok("quote expiry = today + template validity (14d)", sub.quoteExpiresAt.slice(0, 10) === exp, sub.quoteExpiresAt);
r = await call("staff", "POST", `/subscriptions/${sub.id}/confirm`, { version: sub.version });
ok("confirm", r.body.status === "CONFIRMED");
sub = r.body;
r = await call("staff", "PUT", `/subscriptions/${sub.id}/lines`, { version: sub.version, lines: [{ productId: crm.id, quantity: 1 }] });
ok("lines locked after confirm", r.status === 422);
r = await call("staff", "POST", `/subscriptions/${sub.id}/activate`, { version: sub.version });
ok("activate sets next billing date", r.body.status === "ACTIVE" && r.body.nextBillingDate?.slice(0, 10) === today, r.body?.nextBillingDate);
sub = r.body;
r = await call("staff", "POST", `/subscriptions/${sub.id}/pause`, { version: sub.version });
ok("pause (monthly is pausable)", r.body.status === "PAUSED" && r.body.pausedAt);
sub = r.body;
r = await call("staff", "POST", `/subscriptions/${sub.id}/resume`, { version: sub.version });
ok("resume", r.body.status === "ACTIVE" && r.body.pausedAt === null);
sub = r.body;
r = await call("staff", "POST", `/subscriptions/${sub.id}/renew`, { version: sub.version });
ok("renew open-ended → 422", r.status === 422, r.body?.error?.message);

// Concurrency: two closes with the same version → exactly one wins
const [c1, c2] = await Promise.all([
  call("staff", "POST", `/subscriptions/${sub.id}/close`, { version: sub.version, reason: "Moving to competitor" }),
  call("admin", "POST", `/subscriptions/${sub.id}/close`, { version: sub.version }),
]);
const statuses = [c1.status, c2.status].sort();
ok("concurrent close: one 200, one 409", statuses[0] === 200 && statuses[1] === 409, statuses.join(","));
const closed = (c1.status === 200 ? c1 : c2).body;
ok("timeline records full history", closed.timeline.map((t) => t.action).reverse().join(">") === "created>lines_updated>updated>send_quote>confirm>activate>pause>resume>close", closed.timeline.map((t) => t.action).reverse().join(">"));

// Yearly: term-based expiry and renew
r = await call("staff", "POST", "/subscriptions", { customerId: acme.id, planId: yearly.id, startDate: today, lines: [{ productId: crm.id, quantity: 2 }] });
let y = r.body;
for (const a of ["send_quote", "confirm", "activate"]) y = (await call("staff", "POST", `/subscriptions/${y.id}/${a}`, { version: y.version })).body;
const nextYear = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
ok("yearly expiry = start + 1 year", y.expiryDate?.slice(0, 10) === nextYear, y.expiryDate);
r = await call("staff", "POST", `/subscriptions/${y.id}/renew`, { version: y.version });
const in2 = `${Number(today.slice(0, 4)) + 2}${today.slice(4)}`;
ok("renew extends by one term", r.body.expiryDate?.slice(0, 10) === in2, r.body?.expiryDate);
r = await call("staff", "POST", `/subscriptions/${y.id}/pause`, { version: r.body.version });
ok("yearly not pausable → 422", r.status === 422, r.body?.error?.message);

// Future start cannot be activated manually
r = await call("staff", "POST", "/subscriptions", { customerId: acme.id, planId: monthly.id, startDate: future, lines: [{ productId: support.id, quantity: 1 }] });
let f = r.body;
for (const a of ["send_quote", "confirm"]) f = (await call("staff", "POST", `/subscriptions/${f.id}/${a}`, { version: f.version })).body;
r = await call("staff", "POST", `/subscriptions/${f.id}/activate`, { version: f.version });
ok("future start: activate blocked", r.status === 422, r.body?.error?.message);

// List
r = await call("staff", "GET", `/subscriptions?customerId=${acme.id}&pageSize=5`);
ok("list with status counts", r.status === 200 && r.body.counts.CLOSED >= 1 && r.body.counts.ACTIVE >= 1, JSON.stringify(r.body.counts));
r = await call("staff", "GET", `/subscriptions?q=${encodeURIComponent("acme")}&status=ACTIVE`);
ok("search by customer name + status filter", r.body.data.every((s) => s.status === "ACTIVE" && s.customer.name === "Acme Retail"), r.body.total);
r = await call("cust", "GET", "/subscriptions");
ok("customer blocked from back-office list", r.status === 403);
