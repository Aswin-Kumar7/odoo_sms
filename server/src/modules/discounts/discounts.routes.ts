import { Router } from "express";
import { z } from "zod";
import { DiscountKind, DiscountScope, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { ah, IdParam } from "../../lib/http.js";
import { businessRule, conflict, notFound } from "../../lib/errors.js";
import { DateOnly, today } from "../../lib/dates.js";
import { requireRole } from "../../middleware/auth.js";
import { discountAvailability } from "../pricing/engine.js";

// Discount rules. Only the admin creates or edits them; staff can read them
// and attach existing ones to subscriptions.
export const discountsRouter = Router();
discountsRouter.use(requireRole("ADMIN", "STAFF"));

const Fields = z.object({
  name: z.string().trim().min(1).max(100),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,30}$/, "Use 3–30 letters, digits or dashes"),
  kind: z.nativeEnum(DiscountKind),
  value: z.number().int().positive(), // minor units (FIXED) or basis points (PERCENT)
  scope: z.nativeEnum(DiscountScope),
  productId: z.number().int().positive().nullish(),
  minPurchase: z.number().int().min(0).nullish(),
  minQuantity: z.number().int().min(1).nullish(),
  startsOn: DateOnly.nullish(),
  endsOn: DateOnly.nullish(),
  usageLimit: z.number().int().min(1).nullish(),
  isActive: z.boolean().optional(),
});

type Input = Partial<z.infer<typeof Fields>>;

/** Rules that span fields; checked on the merged result so partial updates can't break them. */
async function validate(v: Input) {
  if (v.kind === "PERCENT" && v.value !== undefined && v.value > 10000) throw businessRule("A percentage cannot exceed 100%");
  if (v.scope === "PRODUCT" && !v.productId) throw businessRule("Choose the product this discount applies to");
  if (v.scope === "SUBSCRIPTION" && v.productId) throw businessRule("A whole-subscription discount cannot target a product");
  if (v.startsOn && v.endsOn && v.endsOn < v.startsOn) throw businessRule("End date must be on or after the start date");
  if (v.productId) {
    const product = await prisma.product.findUnique({ where: { id: v.productId }, select: { isActive: true } });
    if (!product || !product.isActive) throw businessRule("Selected product does not exist or is archived");
  }
}

const statusOf = (d: Parameters<typeof discountAvailability>[0]) => {
  const reason = discountAvailability(d, today());
  if (!reason) return "ACTIVE";
  if (reason === "Inactive") return "INACTIVE";
  if (reason.startsWith("Starts")) return "SCHEDULED";
  if (reason.startsWith("Expired")) return "EXPIRED";
  return "USED_UP";
};

discountsRouter.get(
  "/",
  ah(async (_req, res) => {
    const rows = await prisma.discount.findMany({
      relationLoadStrategy: "join",
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: { product: { select: { id: true, name: true } }, _count: { select: { subscriptions: true, invoices: true } } },
    });
    res.json({ data: rows.map((d) => ({ ...d, status: statusOf(d) })) });
  }),
);

discountsRouter.get(
  "/:id",
  ah(async (req, res) => {
    const d = await prisma.discount.findUnique({
      relationLoadStrategy: "join",
      where: { id: IdParam.parse(req.params).id },
      include: { product: { select: { id: true, name: true } }, _count: { select: { subscriptions: true, invoices: true } } },
    });
    if (!d) throw notFound("Discount");
    res.json({ ...d, status: statusOf(d) });
  }),
);

function uniqueCode<T>(p: Promise<T>) {
  return p.catch((err) => {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw conflict("A discount with this code already exists");
    throw err;
  });
}

discountsRouter.post(
  "/",
  requireRole("ADMIN"),
  ah(async (req, res) => {
    const data = Fields.parse(req.body);
    await validate(data);
    const d = await uniqueCode(prisma.discount.create({ data: { ...data, productId: data.scope === "PRODUCT" ? data.productId : null } }));
    res.status(201).json(d);
  }),
);

discountsRouter.patch(
  "/:id",
  requireRole("ADMIN"),
  ah(async (req, res) => {
    const { id } = IdParam.parse(req.params);
    const changes = Fields.partial().parse(req.body);
    const existing = await prisma.discount.findUnique({ where: { id } });
    if (!existing) throw notFound("Discount");
    const merged = { ...existing, ...changes };
    await validate(merged);
    if (merged.usageLimit != null && merged.usageLimit < existing.usageCount) {
      throw businessRule(`Already used ${existing.usageCount} times; the limit cannot be lower than that`);
    }
    if (changes.scope === "SUBSCRIPTION") changes.productId = null;
    res.json(await uniqueCode(prisma.discount.update({ where: { id }, data: changes })));
  }),
);
