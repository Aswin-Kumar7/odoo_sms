import { PrismaClient } from "@prisma/client";

// Each statement is a network round trip to the hosted database (~100 ms), and billing runs
// several transactions in parallel on a small pool. Prisma's defaults (2 s to obtain a
// connection, 5 s per transaction) are too tight for that, so they are widened here.
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  transactionOptions: { maxWait: 10_000, timeout: 20_000 },
});
