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

// ───────────────────────── Discount rules ─────────────────────────
//
// Rules (shown in the UI and covered by unit tests):
//  1. A discount counts only if active, inside its date window on `asOf`, and not used up.
//  2. PRODUCT discounts apply to each line of that product that meets the minimum quantity
//     (line quantity) and minimum purchase (line amount). FIXED = that amount off each
//     matching line; PERCENT = that share of the line.
//  3. SUBSCRIPTION discounts then apply to what remains. Minimum quantity = total product
//     quantity; minimum purchase = subtotal after product discounts. The amount is spread
//     across lines in proportion to their remaining amount (rounding remainder to the largest).
//  4. A line is never discounted below zero. Tax is charged on the discounted amount.

export interface DiscountRule {
  id: number;
  code: string;
  name: string;
  kind: "FIXED" | "PERCENT";
  value: number; // minor units (FIXED) or basis points (PERCENT)
  scope: "PRODUCT" | "SUBSCRIPTION";
  productId: number | null;
  minPurchase: number | null;
  minQuantity: number | null;
  startsOn: Date | null;
  endsOn: Date | null;
  usageLimit: number | null;
  usageCount: number;
  isActive: boolean;
}

export interface DiscountOutcome {
  discountId: number;
  code: string;
  amount: number;
  /** Why it did not apply (null when it applied). */
  reason: string | null;
}

const rupees = (minor: number) => `₹${(minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Rule 1: availability on a date, independent of the lines. */
export function discountAvailability(d: DiscountRule, asOf: Date): string | null {
  if (!d.isActive) return "Inactive";
  if (d.startsOn && asOf < d.startsOn) return `Starts ${d.startsOn.toISOString().slice(0, 10)}`;
  if (d.endsOn && asOf > d.endsOn) return `Expired ${d.endsOn.toISOString().slice(0, 10)}`;
  if (d.usageLimit !== null && d.usageCount >= d.usageLimit) return "Usage limit reached";
  return null;
}

/** Splits `amount` across keys in proportion to `weights`; the rounding remainder goes to the largest weight. */
function allocate(amount: number, weights: { key: string; weight: number }[]): Record<string, number> {
  const total = weights.reduce((a, w) => a + w.weight, 0);
  const out: Record<string, number> = {};
  if (total <= 0 || amount <= 0) return out;
  let given = 0;
  for (const w of weights) {
    out[w.key] = Math.floor((amount * w.weight) / total);
    given += out[w.key];
  }
  const largest = weights.reduce((a, b) => (b.weight > a.weight ? b : a));
  out[largest.key] += amount - given;
  return out;
}

/**
 * Works out how much each discount takes off each line. Pure: the caller supplies
 * the discounts attached to the subscription and the date being priced.
 */
export function resolveDiscounts(lines: PricingLine[], discounts: DiscountRule[], asOf: Date) {
  const remaining = new Map(lines.map((l) => [l.key, l.quantity * l.unitPrice]));
  const discountByKey: Record<string, number> = {};
  const outcomes: DiscountOutcome[] = [];
  const take = (key: string, amount: number) => {
    const a = Math.min(amount, remaining.get(key) ?? 0);
    remaining.set(key, (remaining.get(key) ?? 0) - a);
    discountByKey[key] = (discountByKey[key] ?? 0) + a;
    return a;
  };

  const ordered = [...discounts.filter((d) => d.scope === "PRODUCT"), ...discounts.filter((d) => d.scope === "SUBSCRIPTION")];
  for (const d of ordered) {
    const unavailable = discountAvailability(d, asOf);
    if (unavailable) {
      outcomes.push({ discountId: d.id, code: d.code, amount: 0, reason: unavailable });
      continue;
    }

    if (d.scope === "PRODUCT") {
      const matching = lines.filter((l) => l.productId === d.productId);
      if (matching.length === 0) {
        outcomes.push({ discountId: d.id, code: d.code, amount: 0, reason: "Product not on this subscription" });
        continue;
      }
      let amount = 0;
      let reason: string | null = null;
      for (const l of matching) {
        const base = l.quantity * l.unitPrice;
        if (d.minQuantity !== null && l.quantity < d.minQuantity) {
          reason = `Needs at least ${d.minQuantity} units`;
          continue;
        }
        if (d.minPurchase !== null && base < d.minPurchase) {
          reason = `Needs a line of at least ${rupees(d.minPurchase)}`;
          continue;
        }
        const wanted = d.kind === "PERCENT" ? applyBp(remaining.get(l.key) ?? 0, d.value) : d.value;
        amount += take(l.key, wanted);
      }
      outcomes.push({ discountId: d.id, code: d.code, amount, reason: amount > 0 ? null : reason ?? "Nothing left to discount" });
      continue;
    }

    // SUBSCRIPTION scope
    const totalQty = lines.filter((l) => l.productId !== null).reduce((a, l) => a + l.quantity, 0);
    const remainingTotal = [...remaining.values()].reduce((a, b) => a + b, 0);
    if (d.minQuantity !== null && totalQty < d.minQuantity) {
      outcomes.push({ discountId: d.id, code: d.code, amount: 0, reason: `Needs at least ${d.minQuantity} units in total` });
      continue;
    }
    if (d.minPurchase !== null && remainingTotal < d.minPurchase) {
      outcomes.push({ discountId: d.id, code: d.code, amount: 0, reason: `Needs a subtotal of at least ${rupees(d.minPurchase)}` });
      continue;
    }
    const wanted = Math.min(remainingTotal, d.kind === "PERCENT" ? applyBp(remainingTotal, d.value) : d.value);
    const split = allocate(
      wanted,
      lines.map((l) => ({ key: l.key, weight: remaining.get(l.key) ?? 0 })),
    );
    let amount = 0;
    for (const [key, a] of Object.entries(split)) amount += take(key, a);
    outcomes.push({ discountId: d.id, code: d.code, amount, reason: amount > 0 ? null : "Nothing left to discount" });
  }

  return { discountByKey, outcomes };
}

/** Convenience: resolve discounts and price in one call — what every caller actually needs. */
export function priceWithDiscounts(lines: PricingLine[], discounts: DiscountRule[], asOf: Date) {
  const { discountByKey, outcomes } = resolveDiscounts(lines, discounts, asOf);
  return { ...priceLines(lines, discountByKey), discounts: outcomes };
}
