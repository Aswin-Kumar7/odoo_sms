// Runs against a live API with the demo seed loaded. Creates its own test records:
// use a separate database, or run `npm run db:reset-demo -- --yes` afterwards.
// API integration checks for discounts.
import { call, ok } from "./helpers.mjs";
const today = new Date().toISOString().slice(0, 10);
const past = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
const tag = Date.now().toString(36).toUpperCase().slice(-5);

await call("admin", "POST", "/auth/login", { email: "admin@brightloop.test", password: "Admin@12345" });
await call("staff", "POST", "/auth/login", { email: "staff@brightloop.test", password: "Staff@12345" });

const products = (await call("staff", "GET", "/products?pageSize=50")).body.data;
const crm = products.find((p) => p.name === "Brightloop CRM");
const odoo = crm.variants.find((v) => v.name === "Brand: Odoo");
const support = products.find((p) => p.name === "Support Plus");
const monthly = (await call("staff", "GET", "/plans")).body.data.find((p) => p.name === "Monthly");
const customer = (await call("staff", "POST", "/customers", { name: `Discount Test ${tag}`, email: `discounts-${tag.toLowerCase()}@test.test` })).body;

// ── Discount CRUD rules
let r = await call("staff", "POST", "/discounts", { name: "x", code: "STAFFX", kind: "PERCENT", value: 1000, scope: "SUBSCRIPTION" });
ok("staff cannot create discounts", r.status === 403);
r = await call("admin", "POST", "/discounts", { name: "x", code: "X" + tag, kind: "PERCENT", value: 10001, scope: "SUBSCRIPTION" });
ok("percent > 100% rejected", r.status === 422, r.body?.error?.message);
r = await call("admin", "POST", "/discounts", { name: "x", code: "Y" + tag, kind: "FIXED", value: 500, scope: "PRODUCT" });
ok("product scope needs a product", r.status === 422, r.body?.error?.message);
r = await call("admin", "POST", "/discounts", { name: "x", code: "Z" + tag, kind: "FIXED", value: 500, scope: "SUBSCRIPTION", startsOn: today, endsOn: past });
ok("end before start rejected", r.status === 422, r.body?.error?.message);
r = await call("admin", "POST", "/discounts", { name: "x", code: "a b", kind: "FIXED", value: 500, scope: "SUBSCRIPTION" });
ok("bad code format rejected", r.status === 400);

r = await call("admin", "POST", "/discounts", { name: "10% off 5+ CRM seats", code: `seats-${tag}`, kind: "PERCENT", value: 1000, scope: "PRODUCT", productId: crm.id, minQuantity: 5, usageLimit: 2 });
ok("create product discount (code upper-cased)", r.status === 201 && r.body.code === `SEATS-${tag}`, r.body?.code);
const seats = r.body;
r = await call("admin", "POST", "/discounts", { name: "dup", code: `SEATS-${tag}`, kind: "FIXED", value: 100, scope: "SUBSCRIPTION" });
ok("duplicate code → 409", r.status === 409);
r = await call("admin", "POST", "/discounts", { name: "₹500 off orders over ₹10,000", code: `BIG-${tag}`, kind: "FIXED", value: 50000, scope: "SUBSCRIPTION", minPurchase: 1000000 });
const big = r.body;
r = await call("admin", "POST", "/discounts", { name: "Expired promo", code: `OLD-${tag}`, kind: "PERCENT", value: 2000, scope: "SUBSCRIPTION", startsOn: past, endsOn: yesterday });
const old = r.body;

r = await call("staff", "GET", "/discounts");
const listed = r.body.data;
ok("list shows computed statuses", listed.find((d) => d.id === seats.id)?.status === "ACTIVE" && listed.find((d) => d.id === old.id)?.status === "EXPIRED");

// ── Attach to a subscription with 4 seats → not eligible; 5 seats → eligible
r = await call("staff", "POST", "/subscriptions", { customerId: customer.id, planId: monthly.id, startDate: today, lines: [{ productId: crm.id, variantId: odoo.id, quantity: 4 }, { productId: support.id, quantity: 1 }] });
let sub = r.body;
r = await call("staff", "POST", `/subscriptions/${sub.id}/discounts`, { discountId: seats.id });
ok("staff attaches existing discount", r.status === 200 && r.body.discounts.length === 1);
sub = r.body;
let outcome = sub.totals.discounts.find((d) => d.discountId === seats.id);
ok("4 seats: not applied, reason given", outcome.amount === 0 && outcome.reason === "Needs at least 5 units", outcome.reason);
r = await call("staff", "POST", `/subscriptions/${sub.id}/discounts`, { discountId: seats.id });
ok("attaching twice → 409", r.status === 409);

r = await call("staff", "PUT", `/subscriptions/${sub.id}/lines`, { version: sub.version, lines: [{ productId: crm.id, variantId: odoo.id, quantity: 5 }, { productId: support.id, quantity: 1 }] });
sub = r.body;
outcome = sub.totals.discounts.find((d) => d.discountId === seats.id);
// 10% of 5 × 206000 = 103000; subtotal 1030000 + 99900 = 1129900; taxable 1026900 → tax 184842; total 1211742
ok("5 seats: 10% off CRM line", outcome.amount === 103000 && outcome.reason === null, outcome.amount);
ok("totals: tax on discounted amount", sub.totals.discountTotal === 103000 && sub.totals.taxTotal === 184842 && sub.totals.total === 1211742, JSON.stringify({ d: sub.totals.discountTotal, t: sub.totals.taxTotal, T: sub.totals.total }));

// Whole-subscription discounts
r = await call("staff", "POST", `/subscriptions/${sub.id}/discounts`, { discountId: big.id });
sub = r.body;
outcome = sub.totals.discounts.find((d) => d.discountId === big.id);
ok("₹500 off (subtotal after product discount ₹10,269 ≥ ₹10,000)", outcome.amount === 50000, outcome.amount);
r = await call("staff", "POST", `/subscriptions/${sub.id}/discounts`, { discountId: old.id });
sub = r.body;
outcome = sub.totals.discounts.find((d) => d.discountId === old.id);
ok("expired discount attached but not applied", outcome.amount === 0 && /^Expired/.test(outcome.reason), outcome.reason);
ok("discount total = product + whole", sub.totals.discountTotal === 153000, sub.totals.discountTotal);
ok("timeline records attachments", sub.timeline.filter((t) => t.action === "discount_attached").length === 3);

r = await call("staff", "DELETE", `/subscriptions/${sub.id}/discounts/${old.id}`);
ok("detach", r.status === 200 && r.body.discounts.length === 2 && r.body.timeline[0].action === "discount_removed");

// Usage limit reached → stops applying
r = await call("admin", "PATCH", `/discounts/${seats.id}`, { usageLimit: 1 });
ok("admin edits usage limit", r.status === 200 && r.body.usageLimit === 1);
r = await call("admin", "PATCH", `/discounts/${seats.id}`, { isActive: false });
sub = (await call("staff", "GET", `/subscriptions/${sub.id}`)).body;
outcome = sub.totals.discounts.find((d) => d.discountId === seats.id);
ok("deactivated discount stops applying", outcome.amount === 0 && outcome.reason === "Inactive", outcome.reason);
r = await call("staff", "POST", `/subscriptions/${sub.id}/discounts`, { discountId: seats.id });
ok("cannot attach an inactive discount", r.status === 422 || r.status === 409, r.status);

// Preview (no writes)
r = await call("staff", "POST", "/pricing/preview", { planId: monthly.id, lines: [{ productId: crm.id, variantId: odoo.id, quantity: 5 }], discountIds: [big.id] });
ok("preview prices unsaved lines (₹10,300 subtotal meets ₹10,000 minimum)", r.status === 200 && r.body.subtotal === 1030000 && r.body.discountTotal === 50000, JSON.stringify({ s: r.body.subtotal, d: r.body.discountTotal }));
r = await call("staff", "POST", "/pricing/preview", { planId: monthly.id, lines: [{ productId: crm.id, quantity: 1 }], discountIds: [big.id] });
ok("preview below threshold → no discount", r.body.discountTotal === 0 && r.body.discounts[0].reason.startsWith("Needs a subtotal"), r.body.discounts?.[0]?.reason);

// Closed subscription rejects new discounts
sub = (await call("staff", "POST", `/subscriptions/${sub.id}/cancel`, {})).body;
r = await call("staff", "POST", `/subscriptions/${sub.id}/discounts`, { discountId: big.id });
ok("closed subscription rejects discounts", r.status === 422, r.body?.error?.message);
