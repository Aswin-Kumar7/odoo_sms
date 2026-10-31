import { Router } from "express";
import { z } from "zod";
import { SubscriptionStatus } from "@prisma/client";
import { ah, IdParam, PageQuery } from "../../lib/http.js";
import { DateOnly } from "../../lib/dates.js";
import { requireRole } from "../../middleware/auth.js";
import * as subs from "./subscriptions.service.js";
import type { Action } from "./stateMachine.js";

export const subscriptionsRouter = Router();
subscriptionsRouter.use(requireRole("ADMIN", "STAFF"));

const LineInput = z.object({
  productId: z.number().int().positive(),
  variantId: z.number().int().positive().nullish(),
  quantity: z.number().int().min(1).max(100_000),
  unitPrice: z.number().int().min(0).max(1_000_000_000).optional(),
  taxId: z.number().int().positive().nullable().optional(),
  description: z.string().trim().max(200).optional(),
});

const CreateInput = z
  .object({
    customerId: z.number().int().positive(),
    templateId: z.number().int().positive().optional(),
    planId: z.number().int().positive().optional(),
    startDate: DateOnly,
    paymentTermDays: z.number().int().min(0).max(365).optional(),
    notes: z.string().trim().max(2000).nullish(),
    lines: z.array(LineInput).max(50).optional(),
  })
  .refine((v) => v.templateId || v.planId, { message: "Choose a plan or a quotation template", path: ["planId"] });

const UpdateInput = z.object({
  version: z.number().int().min(0),
  customerId: z.number().int().positive().optional(),
  planId: z.number().int().positive().optional(),
  startDate: DateOnly.optional(),
  expiryDate: DateOnly.nullable().optional(),
  paymentTermDays: z.number().int().min(0).max(365).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const ListQuery = PageQuery.extend({
  status: z.nativeEnum(SubscriptionStatus).optional(),
  customerId: z.coerce.number().int().positive().optional(),
  planId: z.coerce.number().int().positive().optional(),
});

const ACTIONS = ["send_quote", "confirm", "activate", "pause", "resume", "close", "cancel", "renew"] as const;
const ActionParams = IdParam.extend({ action: z.enum(ACTIONS) });
const ActionBody = z.object({ version: z.number().int().min(0).optional(), reason: z.string().trim().max(300).optional() });

subscriptionsRouter.get(
  "/",
  ah(async (req, res) => {
    res.json(await subs.listSubscriptions(ListQuery.parse(req.query)));
  }),
);

subscriptionsRouter.get(
  "/:id",
  ah(async (req, res) => {
    res.json(await subs.getSubscription(IdParam.parse(req.params).id));
  }),
);

subscriptionsRouter.post(
  "/",
  ah(async (req, res) => {
    res.status(201).json(await subs.createSubscription(CreateInput.parse(req.body), req.user!.id));
  }),
);

subscriptionsRouter.patch(
  "/:id",
  ah(async (req, res) => {
    res.json(await subs.updateSubscription(IdParam.parse(req.params).id, UpdateInput.parse(req.body), req.user!.id));
  }),
);

subscriptionsRouter.put(
  "/:id/lines",
  ah(async (req, res) => {
    const { id } = IdParam.parse(req.params);
    const { version, lines } = z.object({ version: z.number().int().min(0), lines: z.array(LineInput).max(50) }).parse(req.body);
    res.json(await subs.replaceLines(id, version, lines, req.user!.id));
  }),
);

subscriptionsRouter.post(
  "/:id/discounts",
  ah(async (req, res) => {
    const { id } = IdParam.parse(req.params);
    const { discountId } = z.object({ discountId: z.number().int().positive() }).parse(req.body);
    res.json(await subs.attachDiscount(id, discountId, req.user!.id));
  }),
);

subscriptionsRouter.delete(
  "/:id/discounts/:discountId",
  ah(async (req, res) => {
    const { id, discountId } = IdParam.extend({ discountId: z.coerce.number().int().positive() }).parse(req.params);
    res.json(await subs.detachDiscount(id, discountId, req.user!.id));
  }),
);

// State transitions are explicit actions, never a free-form status PATCH: the server owns the state machine.
subscriptionsRouter.post(
  "/:id/:action",
  ah(async (req, res) => {
    const { id, action } = ActionParams.parse(req.params);
    const { version, reason } = ActionBody.parse(req.body ?? {});
    res.json(await subs.transition(id, action as Action, { userId: req.user!.id, version, reason }));
  }),
);
