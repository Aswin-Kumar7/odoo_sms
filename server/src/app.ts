import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { requestTiming } from "./middleware/timing.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { authenticate } from "./middleware/auth.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { taxesRouter } from "./modules/catalog/taxes.routes.js";
import { productsRouter } from "./modules/catalog/products.routes.js";
import { plansRouter } from "./modules/catalog/plans.routes.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_URL, credentials: true, exposedHeaders: ["X-Response-Time", "X-Request-Id"] }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(requestTiming);

  app.get("/health", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ok", db: "up" });
    } catch {
      res.status(503).json({ status: "degraded", db: "down" });
    }
  });

  const api = express.Router();
  api.use(authenticate);
  api.use("/auth", authRouter);
  api.use("/users", usersRouter);
  api.use("/taxes", taxesRouter);
  api.use("/products", productsRouter);
  api.use("/plans", plansRouter);
  app.use("/api/v1", api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
