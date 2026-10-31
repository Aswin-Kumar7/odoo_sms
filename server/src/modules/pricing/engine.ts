import { applyBp } from "../../lib/money.js";

// The single pricing engine. Quote previews, subscription totals and invoice generation
// all call this function, so the numbers can never disagree. Pure: no DB access.
// All amounts are integer minor units; rates are basis points.

export interface PricingLine {
  key: string; // stable identifier, e.g. "plan" or "line:12"
  productId: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRateBp: number;
}

export interface PricedLine extends PricingLine {
  base: number; // quantity × unit price
  discountAmount: number;
  taxAmount: number;
  lineTotal: number; // base − discount + tax
}

export interface Totals {
  lines: PricedLine[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
}

/**
 * Prices lines. `discountByKey` is the discount already allocated to each line
 * (discount rules are resolved in a separate step); tax is charged on the
 * discounted amount, rounded half-up per line.
 */
export function priceLines(lines: PricingLine[], discountByKey: Record<string, number> = {}): Totals {
  const priced = lines.map((l): PricedLine => {
    const base = l.quantity * l.unitPrice;
    const discountAmount = Math.min(base, Math.max(0, discountByKey[l.key] ?? 0));
    const taxAmount = applyBp(base - discountAmount, l.taxRateBp);
    return { ...l, base, discountAmount, taxAmount, lineTotal: base - discountAmount + taxAmount };
  });
  const sum = (f: (l: PricedLine) => number) => priced.reduce((acc, l) => acc + f(l), 0);
  const subtotal = sum((l) => l.base);
  const discountTotal = sum((l) => l.discountAmount);
  const taxTotal = sum((l) => l.taxAmount);
  return { lines: priced, subtotal, discountTotal, taxTotal, total: subtotal - discountTotal + taxTotal };
}
