import { Router } from "express";
import { z } from "zod";
import { ah, IdParam, PageQuery } from "../../lib/http.js";
import { DateOnly } from "../../lib/dates.js";
import { requireRole } from "../../middleware/auth.js";
import * as invoices from "./invoices.service.js";

export const invoicesRouter = Router();
invoicesRouter.use(requireRole("ADMIN", "STAFF"));

const ListQuery = PageQuery.extend({
  status: z.enum(["DRAFT", "CONFIRMED", "PAID", "CANCELLED", "OVERDUE"]).optional(),
  customerId: z.coerce.number().int().positive().optional(),
  subscriptionId: z.coerce.number().int().positive().optional(),
  from: DateOnly.optional(),
  to: DateOnly.optional(),
});

invoicesRouter.get(
  "/",
  ah(async (req, res) => {
    res.json(await invoices.listInvoices(ListQuery.parse(req.query)));
  }),
);

invoicesRouter.post(
  "/confirm-bulk",
  ah(async (req, res) => {
    const { ids } = z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) }).parse(req.body);
    res.json(await invoices.confirmMany(ids, req.user!.id));
  }),
);

invoicesRouter.get(
  "/:id",
  ah(async (req, res) => {
    res.json(await invoices.getInvoice(IdParam.parse(req.params).id));
  }),
);

invoicesRouter.post(
  "/:id/confirm",
  ah(async (req, res) => {
    res.json(await invoices.confirmInvoice(IdParam.parse(req.params).id, req.user!.id));
  }),
);

invoicesRouter.post(
  "/:id/cancel",
  ah(async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().max(300).optional() }).parse(req.body ?? {});
    res.json(await invoices.cancelInvoice(IdParam.parse(req.params).id, req.user!.id, reason));
  }),
);

invoicesRouter.post(
  "/:id/send",
  ah(async (req, res) => {
    res.json(await invoices.sendInvoice(IdParam.parse(req.params).id, req.user!.id));
  }),
);
