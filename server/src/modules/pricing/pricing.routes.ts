import { Router } from "express";
import { z } from "zod";
import { ah } from "../../lib/http.js";
import { DateOnly } from "../../lib/dates.js";
import { requireRole } from "../../middleware/auth.js";
import { previewPricing } from "../subscriptions/subscriptions.service.js";

export const pricingRouter = Router();
pricingRouter.use(requireRole("ADMIN", "STAFF"));

const PreviewInput = z.object({
  planId: z.number().int().positive(),
  lines: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        variantId: z.number().int().positive().nullish(),
        quantity: z.number().int().min(1).max(100_000),
        unitPrice: z.number().int().min(0).max(1_000_000_000).optional(),
        taxId: z.number().int().positive().nullable().optional(),
      }),
    )
    .max(50),
  discountIds: z.array(z.number().int().positive()).max(20).optional(),
  asOf: DateOnly.optional(),
});

// Live totals for unsaved lines, computed by the same engine that generates invoices.
pricingRouter.post(
  "/preview",
  ah(async (req, res) => {
    res.json(await previewPricing(PreviewInput.parse(req.body)));
  }),
);
