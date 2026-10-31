import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

// Adds a request id and an X-Response-Time header to every response, so page
// latency (requirement: < 2 s) can be shown in the browser's network tab.
export const requestTiming: RequestHandler = (req, res, next) => {
  req.id = randomUUID().slice(0, 8);
  const start = process.hrtime.bigint();
  const originalWriteHead = res.writeHead;
  res.writeHead = function (this: typeof res, ...args: Parameters<typeof res.writeHead>) {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    this.setHeader("X-Response-Time", `${ms.toFixed(1)}ms`);
    this.setHeader("X-Request-Id", req.id);
    return originalWriteHead.apply(this, args);
  } as typeof res.writeHead;
  next();
};
