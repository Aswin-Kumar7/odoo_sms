-- Tax applied to a plan's recurring base fee (the fee becomes its own taxed invoice line).
ALTER TABLE "recurring_plans" ADD COLUMN "tax_id" INTEGER;

ALTER TABLE "recurring_plans"
  ADD CONSTRAINT "recurring_plans_tax_id_fkey" FOREIGN KEY ("tax_id") REFERENCES "taxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
