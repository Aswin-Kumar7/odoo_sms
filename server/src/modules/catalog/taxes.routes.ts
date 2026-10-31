import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ah, IdParam } from "../../lib/http.js";
import { notFound } from "../../lib/errors.js";
import { requireRole } from "../../middleware/auth.js";

// Taxes are the admin's rules for automatic tax calculation.
export const taxesRouter = Router();
taxesRouter.use(requireRole("ADMIN", "STAFF"));

const TaxInput = z.object({
  name: z.string().trim().min(1).max(60),
  rateBp: z.number().int().min(0).max(10000), // basis points: 1800 = 18%
  isActive: z.boolean().optional(),
});

taxesRouter.get(
  "/",
  ah(async (req, res) => {
    const includeInactive = req.query.includeInactive === "true";
    const data = await prisma.tax.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ isActive: "desc" }, { rateBp: "asc" }],
      include: { _count: { select: { products: true } } },
    });
    res.json({ data });
  }),
);

taxesRouter.post(
  "/",
  requireRole("ADMIN"),
  ah(async (req, res) => {
    const tax = await prisma.tax.create({ data: TaxInput.parse(req.body) });
    res.status(201).json(tax);
  }),
);

taxesRouter.patch(
  "/:id",
  requireRole("ADMIN"),
  ah(async (req, res) => {
    const { id } = IdParam.parse(req.params);
    const data = TaxInput.partial().parse(req.body);
    if (!(await prisma.tax.findUnique({ where: { id }, select: { id: true } }))) throw notFound("Tax");
    // Changing a rate affects only invoices generated afterwards: issued invoice lines keep a snapshot of the rate.
    res.json(await prisma.tax.update({ where: { id }, data }));
  }),
);
