import type { ErrorRequestHandler, RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` } });
};

// Single place where every thrown error becomes an HTTP response.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details ?? null } });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Some fields are invalid", details: err.flatten().fieldErrors },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = (err.meta?.target as string[] | string | undefined) ?? "field";
      res.status(409).json({
        error: { code: "CONFLICT", message: `A record with this ${String(target)} already exists`, details: null },
      });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Record not found", details: null } });
      return;
    }
    // Transaction could not start or timed out (pool exhausted, slow network): nothing was committed.
    if (err.code === "P2028" || err.code === "P2034") {
      console.warn(`[${req.id}] Transaction aborted on ${req.method} ${req.path}: ${err.code}`);
      res.status(503).json({ error: { code: "SERVICE_BUSY", message: "The server is busy; nothing was saved. Please try again.", details: null } });
      return;
    }
  }

  // A database CHECK constraint (SQLSTATE 23514) caught a value the services should have rejected.
  if (err instanceof Prisma.PrismaClientUnknownRequestError && /23514|check constraint/i.test(err.message)) {
    const constraint = /constraint "([^"]+)"/.exec(err.message)?.[1];
    res.status(422).json({
      error: { code: "BUSINESS_RULE", message: "This change violates a data rule", details: constraint ? { constraint } : null },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    res.status(503).json({
      error: { code: "SERVICE_UNAVAILABLE", message: "Database is unavailable, please retry shortly", details: null },
    });
    return;
  }

  // Malformed JSON body from express.json()
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Malformed JSON body", details: null } });
    return;
  }

  console.error(`[${req.id}] Unhandled error on ${req.method} ${req.path}:`, err);
  res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong", details: null } });
};
