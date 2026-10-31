import cron from "node-cron";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { today } from "../../lib/dates.js";
import { runBilling } from "./engine.js";

/**
 * Daily billing trigger. Correctness doesn't depend on it: the engine is idempotent and
 * catches up missed days, so a skipped cron run only delays invoices until the next run
 * (or a manual one). With several API instances every one may fire; the run lock lets one win.
 */
export function startBillingScheduler() {
  if (!env.BILLING_CRON_ENABLED) return;
  cron.schedule(
    env.BILLING_CRON,
    async () => {
      try {
        const r = await runBilling({ asOf: today(), trigger: "CRON", userId: null });
        console.log(`[billing] run ${r.id}: ${r.createdCount} invoices, ${r.activatedCount} activated, ${r.closedCount} closed, ${r.failedCount} failed`);
      } catch (err) {
        if (err instanceof AppError && err.code === "BILLING_IN_PROGRESS") return;
        console.error("[billing] scheduled run failed:", err);
      }
    },
    { timezone: "UTC" },
  );
  console.log(`[billing] daily run scheduled (${env.BILLING_CRON} UTC)`);
}
