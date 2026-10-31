import { Router } from "express";
import { z } from "zod";
import { PaymentMethod } from "@prisma/client";
import { ah, PageQuery } from "../../lib/http.js";
import { DateOnly } from "../../lib/dates.js";
import { requireRole } from "../../middleware/auth.js";
import * as payments from "./payments.service.js";

export const paymentsRouter = Router();
paymentsRouter.use(requireRole("ADMIN", "STAFF"));

/** Staff record real-world payments; the simulated online method is reserved for the customer portal. */
export const PaymentBody = z.object({
  method: z.nativeEnum(PaymentMethod).refine((m) => m !== "ONLINE_SIMULATED", "Choose how the payment was received"),
  amount: z.number().int().positive().max(1_000_000_000),
  paidOn: DateOnly,
  note: z.string().trim().max(300).nullish(),
});

const ListQuery = PageQuery.extend({
  method: z.nativeEnum(PaymentMethod).optional(),
  customerId: z.coerce.number().int().positive().optional(),
  from: DateOnly.optional(),
  to: DateOnly.optional(),
});

paymentsRouter.get(
  "/",
  ah(async (req, res) => {
    res.json(await payments.listPayments(ListQuery.parse(req.query)));
  }),
);
