import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { ah, IdParam, PageQuery, paging } from "../../lib/http.js";
import { businessRule, conflict, notFound } from "../../lib/errors.js";
import { EmailSchema, hashPassword, PasswordSchema } from "../../lib/password.js";
import { evictUserCache, requireRole } from "../../middleware/auth.js";

// User management is admin-only (requirement: "Only the admin can add a new member of staff").
export const usersRouter = Router();
usersRouter.use(requireRole("ADMIN"));

const publicUser = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  customerId: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

const ListQuery = PageQuery.extend({ role: z.enum(["ADMIN", "STAFF", "CUSTOMER"]).optional() });

usersRouter.get(
  "/",
  ah(async (req, res) => {
    const { page, pageSize, q, role } = ListQuery.parse(req.query);
    const where: Prisma.UserWhereInput = {
      ...(role ? { role } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
    };
    // count and page fetched in parallel: one network round trip instead of two.
    const [total, data] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({ where, select: publicUser, orderBy: { createdAt: "desc" }, ...paging(page, pageSize) }),
    ]);
    res.json({ data, page, pageSize, total });
  }),
);

const CreateStaffSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: EmailSchema,
  password: PasswordSchema,
});

usersRouter.post(
  "/",
  ah(async (req, res) => {
    const input = CreateStaffSchema.parse(req.body);
    try {
      const user = await prisma.user.create({
        data: { name: input.name, email: input.email, passwordHash: await hashPassword(input.password), role: "STAFF" },
        select: publicUser,
      });
      res.status(201).json(user);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw conflict("An account with this email already exists");
      }
      throw err;
    }
  }),
);

const UpdateUserSchema = z
  .object({ name: z.string().trim().min(2).max(100), isActive: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

usersRouter.patch(
  "/:id",
  ah(async (req, res) => {
    const { id } = IdParam.parse(req.params);
    const input = UpdateUserSchema.parse(req.body);
    if (id === req.user!.id && input.isActive === false) throw businessRule("You cannot deactivate your own account");

    const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw notFound("User");
    const user = await prisma.user.update({ where: { id }, data: input, select: publicUser });
    evictUserCache(id); // deactivation takes effect on the user's next request
    res.json(user);
  }),
);
