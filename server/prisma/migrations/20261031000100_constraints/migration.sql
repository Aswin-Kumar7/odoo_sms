-- Integrity rules Prisma's schema language cannot express.
-- These are the database-level guarantees behind the billing and money rules.

-- ── Idempotent billing: one live invoice per subscription per period ──
-- Partial so that a CANCELLED invoice's period can be billed again.
CREATE UNIQUE INDEX "invoices_one_per_period"
  ON "invoices" ("subscription_id", "period_start")
  WHERE "status" <> 'CANCELLED';

-- ── At most one billing run in progress, across all API instances ──
-- Works through a transaction-mode connection pooler (Neon/PgBouncer), unlike session advisory locks.
CREATE UNIQUE INDEX "billing_runs_single_running"
  ON "billing_runs" ("status")
  WHERE "status" = 'RUNNING';

-- ── Fast billing scan: only active subscriptions are ever due ──
CREATE INDEX "subscriptions_due_active"
  ON "subscriptions" ("next_billing_date")
  WHERE "status" = 'ACTIVE';

-- ── Document numbers from sequences (no "max + 1" race) ──
CREATE SEQUENCE "subscription_number_seq" START 1;
CREATE SEQUENCE "invoice_number_seq" START 1;

-- ── Money / quantity sanity ──
ALTER TABLE "taxes" ADD CONSTRAINT "taxes_rate_bp_range" CHECK ("rate_bp" BETWEEN 0 AND 10000);
ALTER TABLE "products" ADD CONSTRAINT "products_prices_nonneg" CHECK ("sales_price" >= 0 AND "cost_price" >= 0);
ALTER TABLE "product_variants" ADD CONSTRAINT "variants_price_extra_nonneg" CHECK ("price_extra" >= 0);
ALTER TABLE "recurring_plans" ADD CONSTRAINT "plans_valid" CHECK (
  "price" >= 0 AND "billing_interval" >= 1 AND "min_quantity" >= 1
  AND ("term_length" IS NULL OR "term_length" >= 1)
  AND ("available_to" IS NULL OR "available_from" IS NULL OR "available_to" >= "available_from")
);
ALTER TABLE "quotation_templates" ADD CONSTRAINT "templates_validity_positive" CHECK ("validity_days" > 0);
ALTER TABLE "quotation_template_lines" ADD CONSTRAINT "template_lines_qty_positive" CHECK ("quantity" > 0);
ALTER TABLE "subscription_lines" ADD CONSTRAINT "sub_lines_valid" CHECK ("quantity" > 0 AND "unit_price" >= 0);
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_dates_valid" CHECK (
  "expiry_date" IS NULL OR "expiry_date" > "start_date"
);
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_terms_nonneg" CHECK ("payment_term_days" >= 0);

-- ── Discounts: usage can never exceed its limit, even under concurrency ──
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_usage_within_limit" CHECK (
  "usage_count" >= 0 AND ("usage_limit" IS NULL OR "usage_count" <= "usage_limit")
);
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_value_valid" CHECK (
  "value" > 0 AND ("kind" <> 'PERCENT' OR "value" <= 10000)
);
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_scope_product" CHECK (
  ("scope" = 'PRODUCT' AND "product_id" IS NOT NULL) OR ("scope" = 'SUBSCRIPTION' AND "product_id" IS NULL)
);
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_dates_valid" CHECK (
  "ends_on" IS NULL OR "starts_on" IS NULL OR "ends_on" >= "starts_on"
);

-- ── Invoices & payments ──
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amounts_valid" CHECK (
  "subtotal" >= 0 AND "discount_total" >= 0 AND "tax_total" >= 0 AND "total" >= 0
  AND "amount_paid" >= 0 AND "amount_paid" <= "total"
);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_period_valid" CHECK ("period_end" > "period_start");
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0);
