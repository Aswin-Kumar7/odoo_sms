import { describe, expect, it } from "vitest";
import { priceLines, type PricingLine } from "../../src/modules/pricing/engine.js";

const line = (over: Partial<PricingLine> = {}): PricingLine => ({
  key: "l1",
  productId: 1,
  description: "Seat",
  quantity: 1,
  unitPrice: 100000,
  taxRateBp: 1800,
  ...over,
});

describe("priceLines", () => {
  it("computes base, tax and total in integer paise", () => {
    const t = priceLines([line({ quantity: 5, unitPrice: 206000 })]); // 5 × ₹2,060 (CRM + Odoo variant)
    expect(t.subtotal).toBe(1030000);
    expect(t.taxTotal).toBe(185400);
    expect(t.total).toBe(1215400);
  });

  it("rounds tax half-up per line", () => {
    // 18% of 333 = 59.94 → 60; 18% of 3 = 0.54 → 1
    const t = priceLines([line({ key: "a", unitPrice: 333 }), line({ key: "b", unitPrice: 3 })]);
    expect(t.lines.map((l) => l.taxAmount)).toEqual([60, 1]);
  });

  it("taxes the discounted amount and clamps discounts to the line base", () => {
    const t = priceLines([line({ key: "a", unitPrice: 10000 }), line({ key: "b", unitPrice: 5000 })], { a: 1000, b: 999999 });
    expect(t.lines[0]).toMatchObject({ base: 10000, discountAmount: 1000, taxAmount: 1620, lineTotal: 10620 });
    expect(t.lines[1]).toMatchObject({ base: 5000, discountAmount: 5000, taxAmount: 0, lineTotal: 0 });
    expect(t.discountTotal).toBe(6000);
    expect(t.total).toBe(t.subtotal - t.discountTotal + t.taxTotal);
  });

  it("handles zero-tax lines and empty input", () => {
    expect(priceLines([line({ taxRateBp: 0 })]).taxTotal).toBe(0);
    expect(priceLines([])).toMatchObject({ subtotal: 0, discountTotal: 0, taxTotal: 0, total: 0 });
  });
});
