import { z } from "zod";

// Billing works in calendar dates. They are carried as "YYYY-MM-DD" strings in the API
// and stored in DATE columns; in JS they are Date objects at UTC midnight.

export const DateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Invalid date")
  .transform((s) => new Date(`${s}T00:00:00Z`));

/** Today's date at UTC midnight. */
export function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}
