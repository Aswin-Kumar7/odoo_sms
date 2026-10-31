import { describe, expect, it } from "vitest";
import { discountAvailability, priceWithDiscounts, resolveDiscounts, type DiscountRule, type PricingLine } from "../../src/modules/pricing/engine.js";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const TODAY = d("2026-10-31");

const CRM = 1;
const SUPPORT = 2;

const lines = (crmQty = 5): PricingLine[] => [
  { key: "plan", productId: null, description: "Plan fee", quantity: 1, unitPrice: 100000, taxRateBp: 1800 },
  { key: "line:1", productId: CRM, description: "CRM seat", quantity: crmQty, unitPrice: 206000, taxRateBp: 1800 },
  { key: "line:2", productId: SUPPORT, description: "Support", quantity: 1, unitPrice: 99900, taxRateBp: 1800 },
];

const rule = (over: Partial<DiscountRule> = {}): DiscountRule => ({
  id: 1,
  code: "SEATS10",
  name: "10% for 5+ seats",
  kind: "PERCENT",
  value: 1000,
  scope: "PRODUCT",
  productId: CRM,
  minPurchase: null,
  minQuantity: null,
  startsOn: null,
  endsOn: null,
  usageLimit: null,
  usageCount: 0,
  isActive: true,
  ...over,
});

describe("availability", () => {
  it("checks active flag, date window and usage", () => {
    expect(discountAvailability(rule(), TODAY)).toBeNull();
    expect(discountAvailability(rule({ isActive: false }), TODAY)).toBe("Inactive");
    expect(discountAvailability(rule({ startsOn: d("2026-11-01") }), TODAY)).toMatch(/^Starts/);
    expect(discountAvailability(rule({ endsOn: d("2026-10-30") }), TODAY)).toMatch(/^Expired/);
    expect(discountAvailability(rule({ endsOn: d("2026-10-31") }), TODAY)).toBeNull(); // last day still valid
    expect(discountAvailability(rule({ usageLimit: 2, usageCount: 2 }), TODAY)).toBe("Usage limit reached");
    expect(discountAvailability(rule({ usageLimit: 2, usageCount: 1 }), TODAY)).toBeNull();
  });
});

describe("product discounts", () => {
  it("takes a percentage off matching lines only", () => {
    const { discountByKey, outcomes } = resolveDiscounts(lines(), [rule()], TODAY);
    expect(discountByKey).toEqual({ "line:1": 103000 }); // 10% of 5 × ₹2,060
    expect(outcomes[0]).toMatchObject({ amount: 103000, reason: null });
  });

  it("respects the minimum quantity — 5 seats qualify, 4 do not", () => {
    expect(resolveDiscounts(lines(5), [rule({ minQuantity: 5 })], TODAY).outcomes[0].amount).toBe(103000);
    const four = resolveDiscounts(lines(4), [rule({ minQuantity: 5 })], TODAY).outcomes[0];
    expect(four).toMatchObject({ amount: 0, reason: "Needs at least 5 units" });
  });

  it("respects the minimum purchase on the line", () => {
    const o = resolveDiscounts(lines(1), [rule({ minPurchase: 300000 })], TODAY).outcomes[0];
    expect(o.amount).toBe(0);
    expect(o.reason).toMatch(/Needs a line of at least/);
  });

  it("fixed amounts never push a line below zero", () => {
    const { discountByKey } = resolveDiscounts(lines(1), [rule({ kind: "FIXED", value: 999999999 })], TODAY);
    expect(discountByKey["line:1"]).toBe(206000);
  });

  it("explains when the product is not on the subscription", () => {
    expect(resolveDiscounts(lines(), [rule({ productId: 99 })], TODAY).outcomes[0].reason).toBe("Product not on this subscription");
  });
});

describe("subscription discounts", () => {
  const whole = (over: Partial<DiscountRule> = {}) => rule({ id: 2, code: "LOYAL", scope: "SUBSCRIPTION", productId: null, ...over });

  it("applies to the whole subscription, spread in proportion to each line", () => {
    const { discountByKey, outcomes } = resolveDiscounts(lines(), [whole({ kind: "FIXED", value: 10000 })], TODAY);
    expect(outcomes[0].amount).toBe(10000);
    expect(Object.values(discountByKey).reduce((a, b) => a + b, 0)).toBe(10000); // nothing lost to rounding
    expect(discountByKey["line:1"]).toBeGreaterThan(discountByKey["line:2"]); // bigger line, bigger share
  });

  it("is applied after product discounts, on what remains", () => {
    const res = resolveDiscounts(lines(), [whole({ value: 1000 }), rule()], TODAY); // order given doesn't matter
    // remaining after 10% product discount: 100000 + 927000 + 99900 = 1126900 → 10% = 112690
    expect(res.outcomes.map((o) => [o.code, o.amount])).toEqual([
      ["SEATS10", 103000],
      ["LOYAL", 112690],
    ]);
  });

  it("checks total quantity and subtotal thresholds", () => {
    expect(resolveDiscounts(lines(2), [whole({ minQuantity: 10 })], TODAY).outcomes[0].reason).toBe("Needs at least 10 units in total");
    expect(resolveDiscounts(lines(1), [whole({ minPurchase: 99999999 })], TODAY).outcomes[0].reason).toMatch(/Needs a subtotal/);
  });

  it("stops when expired or used up", () => {
    const expired = resolveDiscounts(lines(), [whole({ endsOn: d("2026-09-30") })], TODAY);
    expect(expired.outcomes[0]).toMatchObject({ amount: 0 });
    expect(expired.discountByKey).toEqual({});
    expect(resolveDiscounts(lines(), [whole({ usageLimit: 3, usageCount: 3 })], TODAY).outcomes[0].amount).toBe(0);
  });
});

describe("priceWithDiscounts", () => {
  it("charges tax on the discounted amount and totals add up", () => {
    const t = priceWithDiscounts(lines(), [rule()], TODAY);
    const crm = t.lines.find((l) => l.key === "line:1")!;
    expect(crm).toMatchObject({ base: 1030000, discountAmount: 103000, taxAmount: 166860, lineTotal: 1093860 });
    expect(t.total).toBe(t.subtotal - t.discountTotal + t.taxTotal);
    expect(t.discounts).toHaveLength(1);
  });
});
