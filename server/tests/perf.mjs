// Times every list and dashboard endpoint against the running API and fails if any is slower
// than the 2-second budget. Load the bulk data first: `npm run seed:perf`.
//   npm run perf            (API_URL defaults to http://localhost:4000)
import { call, login } from "./integration/helpers.mjs";

const BUDGET_MS = 2000;
const RUNS = 5;

await login("staff", "cust");
const firstSub = (await call("staff", "GET", "/subscriptions?pageSize=1")).body.data[0];
const firstInv = (await call("staff", "GET", "/invoices?pageSize=1")).body.data[0];

const endpoints = [
  ["Dashboard summary (uncached first call)", "staff", `/reports/summary?from=2025-11-01&to=2026-10-31&_=${Date.now()}`],
  ["Dashboard summary", "staff", "/reports/summary"],
  ["Revenue trend (12 months)", "staff", "/reports/revenue-trend"],
  ["Subscriptions list", "staff", "/subscriptions"],
  ["Subscriptions: active, page 50", "staff", "/subscriptions?status=ACTIVE&page=50"],
  ["Subscriptions: search", "staff", "/subscriptions?q=lotus"],
  ["Subscription detail", "staff", `/subscriptions/${firstSub.id}`],
  ["Invoices list", "staff", "/invoices"],
  ["Invoices: overdue", "staff", "/invoices?status=OVERDUE"],
  ["Invoices: search", "staff", "/invoices?q=harbor"],
  ["Invoice detail", "staff", `/invoices/${firstInv.id}`],
  ["Payments list", "staff", "/payments"],
  ["Payments: by method + range", "staff", "/payments?method=UPI&from=2026-01-01&to=2026-10-31"],
  ["Customers list", "staff", "/customers"],
  ["Billing runs", "staff", "/billing/runs"],
  ["Portal: my subscriptions", "cust", "/portal/subscriptions"],
  ["Portal: my invoices", "cust", "/portal/invoices"],
];

const counts = (await call("staff", "GET", "/reports/summary")).body;
console.log(`Data: ${counts.subscriptions.total} subscriptions, ${counts.invoiced.count} invoices issued this month, ${counts.outstanding.count} unpaid\n`);
console.log("endpoint".padEnd(42), "server p50".padStart(11), "server max".padStart(11), "wall max".padStart(10));

let slow = 0;
for (const [label, who, path] of endpoints) {
  const server = [];
  const wall = [];
  const runs = label.includes("uncached") ? 1 : RUNS;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    const r = await call(who, "GET", path);
    wall.push(performance.now() - t0);
    if (r.status !== 200) throw new Error(`${path} → ${r.status} ${JSON.stringify(r.body)}`);
    server.push(parseFloat(r.ms));
  }
  server.sort((a, b) => a - b);
  const max = Math.max(...wall);
  if (max > BUDGET_MS) slow++;
  console.log(
    `${max > BUDGET_MS ? "SLOW" : "  ok"} ${label.padEnd(37)}`,
    `${server[Math.floor(server.length / 2)].toFixed(0)} ms`.padStart(11),
    `${server[server.length - 1].toFixed(0)} ms`.padStart(11),
    `${max.toFixed(0)} ms`.padStart(10),
  );
}
console.log(slow ? `\n${slow} endpoint(s) over ${BUDGET_MS} ms` : `\nAll endpoints under ${BUDGET_MS} ms`);
process.exit(slow ? 1 : 0);
