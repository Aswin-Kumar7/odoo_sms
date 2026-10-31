import type { NextFunction, Request, RequestHandler, Response } from "express";
import { z } from "zod";

/** Express 4 does not forward rejected promises to the error handler; this does. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
});

export function paging(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export const IdParam = z.object({ id: z.coerce.number().int().positive() });
