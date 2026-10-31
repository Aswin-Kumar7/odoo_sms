import { Router } from "express";
import { z } from "zod";
import { BillingPeriod, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { ah, IdParam } from "../../lib/http.js";
import { notFound } from "../../lib/errors.js";
import { DateOnly } from "../../lib/dates.js";
import { requireRole } from "../../middleware/auth.js";

// Recurring plans: price, billing cadence, minimum quantity, availability window,
// and the per-plan lifecycle rules.
export const plansRouter = Router();
plansRouter.use(requireRole("ADMIN", "STAFF"));

const PlanFields = z.object({
  name: z.string().trim().min(1).max(100),
  price: z.number().int().min(0).max(1_000_000_000),
  billingPeriod: z.nativeEnum(BillingPeriod),
  billingInterval: z.number().int().min(1).max(36).default(1),
  minQuantity: z.number().int().min(1).max(100_000).default(1),
  availableFrom: DateOnly.nullish(),
  availableTo: DateOnly.nullish(),
  termLength: z.number().int().min(1).max(600).nullish(),
  autoClose: z.boolean().default(false),
  closable: z.boolean().default(true),
  pausable: z.boolean().default(false),
  renewable: z.boolean().default(true),
  isActive: z.boolean().optional(),
});

const windowValid = (v: { availableFrom?: Date | null; availableTo?: Date | null }) =>
  !v.availableFrom || !v.availableTo || v.availableTo >= v.availableFrom;
const windowMessage = { message: "Available-to date must be on or after available-from", path: ["availableTo"] };

// Auto-close happens at expiry, and expiry comes from the term length.
const autoCloseValid = (v: { autoClose?: boolean; termLength?: number | null }) => !v.autoClose || !!v.termLength;
const autoCloseMessage = { message: "Auto-close needs a term length to know when to close", path: ["termLength"] };

const CreatePlan = PlanFields.refine(windowValid, windowMessage).refine(autoCloseValid, autoCloseMessage);
const UpdatePlan = PlanFields.partial().refine(windowValid, windowMessage);

const ListQuery = z.object({
  includeInactive: z.enum(["true", "false"]).default("false"),
  availableOn: DateOnly.optional(), // only plans that can be sold on this date
});

plansRouter.get(
  "/",
  ah(async (req, res) => {
    const q = ListQuery.parse(req.query);
    const where: Prisma.RecurringPlanWhereInput = {
      ...(q.includeInactive === "true" ? {} : { isActive: true }),
      ...(q.availableOn
        ? {
            AND: [
              { OR: [{ availableFrom: null }, { availableFrom: { lte: q.availableOn } }] },
              { OR: [{ availableTo: null }, { availableTo: { gte: q.availableOn } }] },
            ],
          }
        : {}),
    };
    const data = await prisma.recurringPlan.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: { _count: { select: { subscriptions: true } } },
    });
    res.json({ data });
  }),
);

plansRouter.get(
  "/:id",
  ah(async (req, res) => {
    const plan = await prisma.recurringPlan.findUnique({ where: { id: IdParam.parse(req.params).id } });
    if (!plan) throw notFound("Plan");
    res.json(plan);
  }),
);

plansRouter.post(
  "/",
  requireRole("ADMIN"),
  ah(async (req, res) => {
    res.status(201).json(await prisma.recurringPlan.create({ data: CreatePlan.parse(req.body) }));
  }),
);

plansRouter.patch(
  "/:id",
  requireRole("ADMIN"),
  ah(async (req, res) => {
    const { id } = IdParam.parse(req.params);
    const data = UpdatePlan.parse(req.body);
    const existing = await prisma.recurringPlan.findUnique({ where: { id } });
    if (!existing) throw notFound("Plan");
    // A partial update must still leave a valid window once merged with stored values.
    const from = data.availableFrom !== undefined ? data.availableFrom : existing.availableFrom;
    const to = data.availableTo !== undefined ? data.availableTo : existing.availableTo;
    if (!windowValid({ availableFrom: from, availableTo: to })) {
      throw new z.ZodError([{ code: "custom", path: ["availableTo"], message: windowMessage.message }]);
    }
    const autoClose = data.autoClose ?? existing.autoClose;
    const termLength = data.termLength !== undefined ? data.termLength : existing.termLength;
    if (!autoCloseValid({ autoClose, termLength })) {
      throw new z.ZodError([{ code: "custom", path: ["termLength"], message: autoCloseMessage.message }]);
    }
    res.json(await prisma.recurringPlan.update({ where: { id }, data }));
  }),
);

plansRouter.delete(
  "/:id",
  requireRole("ADMIN"),
  ah(async (req, res) => {
    const { id } = IdParam.parse(req.params);
    if (!(await prisma.recurringPlan.findUnique({ where: { id }, select: { id: true } }))) throw notFound("Plan");
    await prisma.recurringPlan.update({ where: { id }, data: { isActive: false } });
    res.status(204).end();
  }),
);
