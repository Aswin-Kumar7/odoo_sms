import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ah, IdParam } from "../../lib/http.js";
import { notFound, businessRule } from "../../lib/errors.js";
import { addDays, DateOnly, today } from "../../lib/dates.js";
import { requireRole } from "../../middleware/auth.js";
import { runBilling } from "./engine.js";

export const billingRouter = Router();
billingRouter.use(requireRole("ADMIN", "STAFF"));

const MAX_DAYS_AHEAD = 400;

// Admin-only: run billing now, or "as of" a future date to show a month passing during a demo.
billingRouter.post(
  "/run",
  requireRole("ADMIN"),
  ah(async (req, res) => {
    const { asOf } = z.object({ asOf: DateOnly.optional() }).parse(req.body ?? {});
    const date = asOf ?? today();
    if (date > addDays(today(), MAX_DAYS_AHEAD)) throw businessRule(`Billing can run at most ${MAX_DAYS_AHEAD} days ahead`);
    res.json(await runBilling({ asOf: date, trigger: "MANUAL", userId: req.user!.id }));
  }),
);

billingRouter.get(
  "/runs",
  ah(async (_req, res) => {
    const data = await prisma.billingRun.findMany({
      relationLoadStrategy: "join",
      orderBy: { startedAt: "desc" },
      take: 50,
      include: { triggeredBy: { select: { name: true } } },
    });
    res.json({ data });
  }),
);

billingRouter.get(
  "/runs/:id",
  ah(async (req, res) => {
    const run = await prisma.billingRun.findUnique({
      relationLoadStrategy: "join",
      where: { id: IdParam.parse(req.params).id },
      include: {
        triggeredBy: { select: { name: true } },
        invoices: {
          orderBy: { id: "asc" },
          take: 500,
          select: { id: true, number: true, status: true, total: true, periodStart: true, customer: { select: { name: true } }, subscription: { select: { number: true } } },
        },
      },
    });
    if (!run) throw notFound("Billing run");
    res.json(run);
  }),
);
