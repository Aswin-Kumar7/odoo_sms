import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ah, IdParam } from "../../lib/http.js";
import { businessRule, notFound } from "../../lib/errors.js";
import { requireRole } from "../../middleware/auth.js";

// Quotation templates: a plan plus product lines, valid for a set number of days.
export const templatesRouter = Router();
templatesRouter.use(requireRole("ADMIN", "STAFF"));

const LineInput = z.object({
  productId: z.number().int().positive(),
  variantId: z.number().int().positive().nullish(),
  quantity: z.number().int().min(1).max(100_000),
});

const TemplateInput = z.object({
  name: z.string().trim().min(1).max(120),
  planId: z.number().int().positive(),
  validityDays: z.number().int().min(1).max(365),
  notes: z.string().trim().max(2000).nullish(),
  isActive: z.boolean().optional(),
  lines: z.array(LineInput).max(50),
});

const detailInclude = {
  plan: { select: { id: true, name: true, billingPeriod: true, billingInterval: true, minQuantity: true, price: true } },
  lines: {
    orderBy: { id: "asc" as const },
    include: {
      product: { select: { id: true, name: true, salesPrice: true } },
      variant: { select: { id: true, name: true, priceExtra: true } },
    },
  },
};

/** Plan must be active; products active; variants must belong to their product; quantities meet the plan minimum. */
async function validate(planId: number, lines: z.infer<typeof LineInput>[]) {
  const plan = await prisma.recurringPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive) throw businessRule("Selected plan does not exist or is inactive");

  const productIds = [...new Set(lines.map((l) => l.productId))];
  const products = await prisma.product.findMany({
    relationLoadStrategy: "join",
    where: { id: { in: productIds } },
    select: { id: true, isActive: true, variants: { where: { isActive: true }, select: { id: true } } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const l of lines) {
    const p = byId.get(l.productId);
    if (!p || !p.isActive) throw businessRule(`Product ${l.productId} does not exist or is archived`);
    if (l.variantId && !p.variants.some((v) => v.id === l.variantId)) throw businessRule("A variant does not belong to its product");
    if (l.quantity < plan.minQuantity) throw businessRule(`Quantity must be at least ${plan.minQuantity} for the ${plan.name} plan`);
  }
}

templatesRouter.get(
  "/",
  ah(async (req, res) => {
    const includeInactive = req.query.includeInactive === "true";
    const data = await prisma.quotationTemplate.findMany({
      relationLoadStrategy: "join",
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: { ...detailInclude, _count: { select: { subscriptions: true } } },
    });
    res.json({ data });
  }),
);

templatesRouter.get(
  "/:id",
  ah(async (req, res) => {
    const t = await prisma.quotationTemplate.findUnique({ relationLoadStrategy: "join", where: { id: IdParam.parse(req.params).id }, include: detailInclude });
    if (!t) throw notFound("Template");
    res.json(t);
  }),
);

templatesRouter.post(
  "/",
  requireRole("ADMIN"),
  ah(async (req, res) => {
    const { lines, ...fields } = TemplateInput.parse(req.body);
    await validate(fields.planId, lines);
    const t = await prisma.quotationTemplate.create({
      data: { ...fields, lines: { create: lines.map((l) => ({ ...l, variantId: l.variantId ?? null })) } },
      include: detailInclude,
    });
    res.status(201).json(t);
  }),
);

// Template lines are replaced wholesale: nothing references a template line.
templatesRouter.put(
  "/:id",
  requireRole("ADMIN"),
  ah(async (req, res) => {
    const { id } = IdParam.parse(req.params);
    const { lines, ...fields } = TemplateInput.parse(req.body);
    if (!(await prisma.quotationTemplate.findUnique({ where: { id }, select: { id: true } }))) throw notFound("Template");
    await validate(fields.planId, lines);
    const t = await prisma.$transaction(async (tx) => {
      await tx.quotationTemplateLine.deleteMany({ where: { templateId: id } });
      return tx.quotationTemplate.update({
        where: { id },
        data: { ...fields, lines: { create: lines.map((l) => ({ ...l, variantId: l.variantId ?? null })) } },
        include: detailInclude,
      });
    });
    res.json(t);
  }),
);

templatesRouter.patch(
  "/:id",
  requireRole("ADMIN"),
  ah(async (req, res) => {
    const { id } = IdParam.parse(req.params);
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    if (!(await prisma.quotationTemplate.findUnique({ where: { id }, select: { id: true } }))) throw notFound("Template");
    res.json(await prisma.quotationTemplate.update({ where: { id }, data: { isActive }, include: detailInclude }));
  }),
);
