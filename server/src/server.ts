import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { startBillingScheduler } from "./modules/billing/scheduler.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
  startBillingScheduler();
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
