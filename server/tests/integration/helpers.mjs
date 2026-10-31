// Shared helpers for the API integration suites: a cookie-jar client per role and a check printer.
export const B = `${process.env.API_URL ?? "http://localhost:4000"}/api/v1`;

const jar = {};
let last = null;

export async function call(who, method, path, body) {
  const res = await fetch(B + path, {
    method,
    headers: { "Content-Type": "application/json", ...(jar[who] ? { Cookie: jar[who] } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = res.headers.get("set-cookie");
  if (sc) jar[who] = sc.split(";")[0];
  const text = await res.text();
  const out = { status: res.status, body: text ? JSON.parse(text) : null, ms: res.headers.get("x-response-time") };
  last = { method, path, ...out };
  return out;
}

/** Prints PASS/FAIL; on failure also prints the most recent response, so a flaky check explains itself. */
export function ok(label, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${extra !== "" ? " — " + extra : ""}`);
  if (!cond && last) console.log(`  ↳ last response: ${last.method} ${last.path} → ${last.status} ${JSON.stringify(last.body)?.slice(0, 500)}`);
}

export const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

export const LOGINS = {
  admin: { email: "admin@brightloop.test", password: "Admin@12345" },
  staff: { email: "staff@brightloop.test", password: "Staff@12345" },
  cust: { email: "customer@brightloop.test", password: "Customer@123" },
};

export async function login(...roles) {
  await Promise.all(roles.map((r) => call(r, "POST", "/auth/login", LOGINS[r])));
}
