// Runs every API integration suite in sequence and fails if any check fails.
//   npm run test:api            (API must be running; API_URL defaults to http://localhost:4000)
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0;
for (const suite of ["subscriptions.mjs", "discounts.mjs", "billing.mjs", "payments.mjs", "reports.mjs"]) {
  const r = spawnSync(process.execPath, [join(here, suite)], { encoding: "utf8" });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  const pass = (out.match(/^PASS/gm) ?? []).length;
  const fail = (out.match(/^FAIL/gm) ?? []).length + (r.status === 0 ? 0 : 1);
  console.log(`${suite}: ${pass} passed, ${fail} failed`);
  if (fail) {
    console.log(
      out
        .split(/\r?\n/)
        .filter((l) => l.startsWith("FAIL") || l.startsWith("  ↳") || /Error/.test(l))
        .join("\n"),
    );
  }
  failed += fail;
}
process.exit(failed ? 1 : 0);
