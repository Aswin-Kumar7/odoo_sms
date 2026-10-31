import { Router } from "express";
import { z } from "zod";
import { ProductType } from "@prisma/client";
import { ah, IdParam, PageQuery } from "../../lib/http.js";
import { requireRole } from "../../middleware/auth.js";
import * as products from "./products.service.js";

export const productsRouter = Router();
productsRouter.use(requireRole("ADMIN", "STAFF"));

const Money = z.number().int().min(0).max(1_000_000_000); // minor units

const VariantInput = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(100),
  attributes: z.record(z.string().trim().max(60), z.string().trim().max(100)).default({}),
  priceExtra: Money.default(0),
  isActive: z.boolean().optional(),
});

const ProductInput = z.object({
  name: z.string().trim().min(1).max(150),
  type: z.nativeEnum(ProductType),
  salesPrice: Money,
  costPrice: Money,
  notes: z.string().trim().max(2000).nullish(),
  taxId: z.number().int().positive().nullish(),
  isActive: z.boolean().optional(),
  variants: z.array(VariantInput).max(50).optional(),
});

const ListQuery = PageQuery.extend({
  type: z.nativeEnum(ProductType).optional(),
  includeInactive: z.enum(["true", "false"]).default("false"),
});

productsRouter.get(
  "/",
  ah(async (req, res) => {
    const q = ListQuery.parse(req.query);
    res.json(await products.listProducts({ ...q, includeInactive: q.includeInactive === "true" }));
  }),
);

productsRouter.get(
  "/:id",
  ah(async (req, res) => {
    res.json(await products.getProduct(IdParam.parse(req.params).id));
  }),
);

productsRouter.post(
  "/",
  requireRole("ADMIN"),
  ah(async (req, res) => {
    res.status(201).json(await products.createProduct(ProductInput.parse(req.body)));
  }),
);

productsRouter.patch(
  "/:id",
  requireRole("ADMIN"),
  ah(async (req, res) => {
    const { id } = IdParam.parse(req.params);
    res.json(await products.updateProduct(id, ProductInput.partial().parse(req.body)));
  }),
);

// Soft delete: products stay referenced by subscriptions and invoices.
productsRouter.delete(
  "/:id",
  requireRole("ADMIN"),
  ah(async (req, res) => {
    const { id } = IdParam.parse(req.params);
    await products.updateProduct(id, { isActive: false });
    res.status(204).end();
  }),
);
