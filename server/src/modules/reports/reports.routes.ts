import { Router } from "express";
import { z } from "zod";
import { ah } from "../../lib/http.js";
import { DateOnly, today } from "../../lib/dates.js";
import { badRequest } from "../../lib/errors.js";
import { requireRole } from "../../middleware/auth.js";
import * as reports from "./reports.service.js";

export const reportsRouter = Router();
reportsRouter.use(requireRole("ADMIN", "STAFF"));

const PlanFilter = z.object({ planId: z.coerce.number().int().positive().optional() });

reportsRouter.get(
  "/summary",
  ah(async (req, res) => {
    const q = PlanFilter.extend({ from: DateOnly.optional(), to: DateOnly.optional() }).parse(req.query);
    const t = today();
    // Default range: the current month to date.
    const from = q.from ?? new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
    const to = q.to ?? t;
    if (to < from) throw badRequest("The end date must be on or after the start date", { to: ["Must be on or after the start date"] });
    if (to.getTime() - from.getTime() > 5 * 366 * 86_400_000) throw badRequest("Choose a range of five years or less");
    res.json(await reports.summary({ from, to, planId: q.planId }));
  }),
);

reportsRouter.get(
  "/revenue-trend",
  ah(async (req, res) => {
    const q = PlanFilter.extend({ months: z.coerce.number().int().min(1).max(36).default(12) }).parse(req.query);
    res.json(await reports.revenueTrend(q.months, q.planId));
  }),
);
