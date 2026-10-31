// Wipes all business data and re-seeds the demo set. The schema and migrations are kept.
// Destructive by design, so it refuses to run without --yes and never in production.
//   npm run db:reset-demo -- --yes            (add --perf to also load the bulk performance data)
import "dotenv/config";
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

if (!process.argv.includes("--yes")) {
  console.error("This deletes ALL data (users, subscriptions, invoices, payments…). Re-run with --yes to confirm.");
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to reset a production database.");
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE subscription_number_seq RESTART WITH 1`);
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE invoice_number_seq RESTART WITH 1`);
  console.log(`Cleared ${tables.length} tables and reset document numbers.`);
}

main()
  .then(() => prisma.$disconnect())
  .then(() => execSync("npm run seed", { stdio: "inherit" }))
  .then(() => process.argv.includes("--perf") && execSync("npm run seed:perf", { stdio: "inherit" }))
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
