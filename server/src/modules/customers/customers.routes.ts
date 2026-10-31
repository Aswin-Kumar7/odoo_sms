import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { ah, IdParam, PageQuery, paging } from "../../lib/http.js";
import { notFound } from "../../lib/errors.js";
import { EmailSchema } from "../../lib/password.js";
import { requireRole } from "../../middleware/auth.js";

// Customers are handled day to day by staff and admins. Self sign-up also creates one.
export const customersRouter = Router();
customersRouter.use(requireRole("ADMIN", "STAFF"));

const CustomerInput = z.object({
  name: z.string().trim().min(1).max(150),
  email: EmailSchema,
  phone: z.string().trim().max(30).nullish(),
  address: z.string().trim().max(500).nullish(),
  taxId: z.string().trim().max(30).nullish(), // e.g. GSTIN
});

customersRouter.get(
  "/",
  ah(async (req, res) => {
    const { page, pageSize, q } = PageQuery.parse(req.query);
    const where: Prisma.CustomerWhereInput = q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }
      : {};
    const [total, data] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        relationLoadStrategy: "join",
        where,
        orderBy: { name: "asc" },
        include: { _count: { select: { subscriptions: true } }, user: { select: { id: true } } },
        ...paging(page, pageSize),
      }),
    ]);
    res.json({
      data: data.map(({ user, ...c }) => ({ ...c, hasPortalAccess: !!user })),
      page,
      pageSize,
      total,
    });
  }),
);

customersRouter.get(
  "/:id",
  ah(async (req, res) => {
    const customer = await prisma.customer.findUnique({
      where: { id: IdParam.parse(req.params).id },
      include: { _count: { select: { subscriptions: true, invoices: true } } },
    });
    if (!customer) throw notFound("Customer");
    res.json(customer);
  }),
);

customersRouter.post(
  "/",
  ah(async (req, res) => {
    res.status(201).json(await prisma.customer.create({ data: CustomerInput.parse(req.body) }));
  }),
);

customersRouter.patch(
  "/:id",
  ah(async (req, res) => {
    const { id } = IdParam.parse(req.params);
    const data = CustomerInput.partial().parse(req.body);
    if (!(await prisma.customer.findUnique({ where: { id }, select: { id: true } }))) throw notFound("Customer");
    res.json(await prisma.customer.update({ where: { id }, data }));
  }),
);
