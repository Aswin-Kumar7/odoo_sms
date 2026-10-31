// Runs against a live API with the demo seed loaded. Creates its own test records:
// use a separate database, or run `npm run db:reset-demo -- --yes` afterwards.
// API integration checks for the billing engine and invoices.
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
  return { status: res.status, body: text ? JSON.parse(text) : null, ms: res.headers.get("x-response-time") };
}
const ok = (label, cond, extra = "") => console.log(`${cond ? "PASS" : "FAIL"} ${label}${extra !== "" ? " — " + extra : ""}`);
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const addMonths = (iso, m) => { const d = new Date(iso + "T00:00:00Z"); const y = d.getUTCFullYear(), mo = d.getUTCMonth() + m; const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate(); return new Date(Date.UTC(y, mo, Math.min(d.getUTCDate(), last))).toISOString().slice(0, 10); }; // anchored, clamped to month end
const today = day(0);
const tag = Date.now().toString(36).toUpperCase().slice(-5);

await call("admin", "POST", "/auth/login", { email: "admin@brightloop.test", password: "Admin@12345" });
await call("staff", "POST", "/auth/login", { email: "staff@brightloop.test", password: "Staff@12345" });

const products = (await call("staff", "GET", "/products?pageSize=50")).body.data;
const crm = products.find((p) => p.name === "Brightloop CRM");
const odoo = crm.variants.find((v) => v.name === "Brand: Odoo");
const support = products.find((p) => p.name === "Support Plus");
const plans = (await call("staff", "GET", "/plans")).body.data;
const monthly = plans.find((p) => p.name === "Monthly");
const trial = plans.find((p) => p.name === "Weekly trial");
const cust = (await call("staff", "POST", "/customers", { name: `Billing Test ${tag}`, email: `billing-${tag.toLowerCase()}@test.test` })).body;

async function activeSub(startDate, planId = monthly.id, lines = [{ productId: crm.id, variantId: odoo.id, quantity: 5 }, { productId: support.id, quantity: 1 }], steps = ["send_quote", "confirm", "activate"]) {
  let s = (await call("staff", "POST", "/subscriptions", { customerId: cust.id, planId, startDate, lines })).body;
  for (const a of steps) {
    const r = await call("staff", "POST", `/subscriptions/${s.id}/${a}`, {});
    if (r.status !== 200) throw new Error(`${a} failed: ${JSON.stringify(r.body)}`);
    s = r.body;
  }
  return s;
}
const invoicesOf = async (subId) => (await call("staff", "GET", `/invoices?subscriptionId=${subId}&pageSize=50`)).body.data.sort((a, b) => a.periodStart.localeCompare(b.periodStart));
const run = (asOf, who = "admin") => call(who, "POST", "/billing/run", { asOf });

// ── Setup
const lim = (await call("admin", "POST", "/discounts", { name: "One use only", code: `LIM-${tag}`, kind: "PERCENT", value: 1000, scope: "PRODUCT", productId: crm.id, minQuantity: 5, usageLimit: 1 })).body;
const A = await activeSub(today);
const Bs = await activeSub(today);
await call("staff", "POST", `/subscriptions/${A.id}/discounts`, { discountId: lim.id });
await call("staff", "POST", `/subscriptions/${Bs.id}/discounts`, { discountId: lim.id });
const late = await activeSub(day(-40)); // started 40 days ago, never billed → catch-up
const future = await activeSub(day(5), monthly.id, undefined, ["send_quote", "confirm"]); // confirmed, starts in 5 days
const weekly = await activeSub(today, trial.id, [{ productId: support.id, quantity: 1 }]); // 2-week trial, auto-closes
ok("setup: weekly trial expiry = start + 14 days", weekly.expiryDate.slice(0, 10) === day(14), weekly.expiryDate);

// ── RBAC
let r = await run(today, "staff");
ok("staff cannot run billing", r.status === 403);
ok("staff can read runs", (await call("staff", "GET", "/billing/runs")).status === 200);

// ── Run 1 (today)
r = await run(today);
ok("run today completes", r.status === 200 && r.body.status === "COMPLETED", `created ${r.body.createdCount}, failed ${r.body.failedCount}, ${r.body.durationMs} ms ${JSON.stringify(r.body.errors)}`);
const run1 = r.body;
let invA = await invoicesOf(A.id), invB = await invoicesOf(Bs.id);
ok("A and B each get one invoice", invA.length === 1 && invB.length === 1);
const detailA = (await call("staff", "GET", `/invoices/${invA[0].id}`)).body;
const detailB = (await call("staff", "GET", `/invoices/${invB[0].id}`)).body;
ok("invoice number format", /^INV-\d{4}-\d{6}$/.test(detailA.number), detailA.number);
ok("invoice is a draft, due = issue + 15 days", detailA.status === "DRAFT" && detailA.dueDate.slice(0, 10) === day(15), detailA.dueDate);
ok("lines snapshotted (2 lines, rates copied)", detailA.lines.length === 2 && detailA.lines.every((l) => l.taxRateBp === 1800));
const discounted = [detailA, detailB].filter((d) => d.discountTotal > 0);
ok("usage limit 1 → exactly one of A/B got the discount (atomic redemption)", discounted.length === 1, discounted.map((d) => d.number).join(","));
ok("discounted invoice: 10% off CRM = ₹1,030", discounted[0]?.discountTotal === 103000 && discounted[0]?.discounts[0]?.discount.code === `LIM-${tag}`);
let limNow = (await call("staff", "GET", `/discounts/${lim.id}`)).body;
ok("discount usage_count = 1, status USED_UP", limNow.usageCount === 1 && limNow.status === "USED_UP", `${limNow.usageCount} ${limNow.status}`);
const lateInv = await invoicesOf(late.id);
ok("catch-up: subscription started 40 days ago gets 2 invoices", lateInv.length === 2 && lateInv[0].periodStart.slice(0, 10) === day(-40), lateInv.map((i) => i.periodStart.slice(0, 10)).join(","));
ok("future-start confirmed sub not activated yet", (await invoicesOf(future.id)).length === 0);

// ── Run 2 (same date) → nothing billed twice
r = await run(today);
ok("rerun same date creates 0 invoices", r.body.createdCount === 0 && r.body.failedCount === 0, JSON.stringify({ c: r.body.createdCount, s: r.body.skippedCount }));
ok("A still has exactly 1 invoice", (await invoicesOf(A.id)).length === 1);

// ── Concurrent runs → one wins, the other gets 409
const [c1, c2] = await Promise.all([run(today), run(today)]);
const sts = [c1.status, c2.status].sort();
ok("two simultaneous runs: one 200, one 409 BILLING_IN_PROGRESS", sts[0] === 200 && sts[1] === 409 && [c1, c2].find((x) => x.status === 409).body.error.code === "BILLING_IN_PROGRESS", sts.join(","));

// ── Overdue
const lateDetail = (await call("staff", "POST", `/invoices/${lateInv[0].id}/confirm`)).body;
ok("confirm draft", lateDetail.status === "CONFIRMED" && lateDetail.overdue === true, `due ${lateDetail.dueDate.slice(0, 10)}`);
r = await call("staff", "POST", `/invoices/${lateInv[0].id}/confirm`);
ok("confirm twice → 409", r.status === 409);
r = await call("staff", "GET", `/invoices?status=OVERDUE&customerId=${cust.id}`);
ok("overdue filter finds it", r.body.data.some((i) => i.id === lateInv[0].id) && r.body.counts.OVERDUE >= 1, `counts ${JSON.stringify(r.body.counts)}`);

// ── Send
r = await call("staff", "POST", `/invoices/${invA[0].id}/send`);
ok("sending a draft is refused", r.status === 422);
r = await call("staff", "POST", `/invoices/${lateInv[0].id}/send`);
ok("send confirmed invoice → sentAt set", r.status === 200 && r.body.sentAt);

// ── Bulk confirm
r = await call("staff", "POST", "/invoices/confirm-bulk", { ids: [invA[0].id, invB[0].id, lateInv[0].id] });
ok("bulk confirm: 2 confirmed, 1 skipped (already confirmed)", r.body.confirmed === 2 && r.body.skipped === 1, JSON.stringify(r.body));

// ── Run +5 days → auto-activation
r = await run(day(5));
ok("run +5d auto-activates the future subscription and bills it", r.body.activatedCount >= 1 && (await invoicesOf(future.id)).length === 1, `activated ${r.body.activatedCount}`);

// ── Run +14 days → weekly trial billed twice then closed
r = await run(day(14));
const weeklyInv = await invoicesOf(weekly.id);
const weeklyNow = (await call("staff", "GET", `/subscriptions/${weekly.id}`)).body;
ok("weekly trial: 2 invoices, then auto-closed at expiry", weeklyInv.length === 2 && weeklyNow.status === "CLOSED" && r.body.closedCount >= 1, `${weeklyInv.length} invoices, ${weeklyNow.status}`);
ok("auto-close recorded on timeline", weeklyNow.timeline[0].action === "auto_close");

// ── Run +2 months → catch-up for A
const twoMonths = addMonths(today, 2);
r = await run(twoMonths);
invA = await invoicesOf(A.id);
ok("A after +2 months: 3 invoices with consecutive periods", invA.length === 3 && invA[1].periodStart.slice(0, 10) === addMonths(today, 1) && invA[2].periodStart.slice(0, 10) === twoMonths, invA.map((i) => i.periodStart.slice(0, 10)).join(","));
ok("periods chain: each end = next start", invA[0].periodEnd === invA[1].periodStart && invA[1].periodEnd === invA[2].periodStart);
const laterA = (await call("staff", "GET", `/invoices/${invA[2].id}`)).body;
ok("used-up discount not applied on later invoices", laterA.discountTotal === 0);

// ── Cancel latest → cursor rewinds → rerun regenerates the period
r = await call("staff", "POST", `/invoices/${invA[2].id}/cancel`, { reason: "Wrong seat count" });
ok("cancel unpaid invoice", r.status === 200 && r.body.status === "CANCELLED");
r = await run(twoMonths);
invA = await invoicesOf(A.id);
const regenerated = invA.filter((i) => i.periodStart.slice(0, 10) === twoMonths);
ok("cancelled period billed again (partial unique index allows it)", regenerated.length === 2 && regenerated.filter((i) => i.status !== "CANCELLED").length === 1, regenerated.map((i) => `${i.number}:${i.status}`).join(","));

// ── Cancel the discounted invoice → usage released
const discountedId = discounted[0].id;
await call("staff", "POST", `/invoices/${discountedId}/cancel`, {});
limNow = (await call("staff", "GET", `/discounts/${lim.id}`)).body;
ok("cancelling the discounted invoice releases the use", limNow.usageCount === 0 && limNow.status === "ACTIVE", `${limNow.usageCount} ${limNow.status}`);
r = await call("staff", "POST", `/invoices/${discountedId}/cancel`, {});
ok("cancel twice → 409", r.status === 409);

// ── Run log
r = await call("staff", "GET", `/billing/runs/${run1.id}`);
ok("run detail lists its invoices", r.status === 200 && r.body.invoices.length === run1.createdCount, `${r.body.invoices?.length} vs ${run1.createdCount}`);
r = await run(day(500));
ok("asOf too far ahead rejected", r.status === 422);
