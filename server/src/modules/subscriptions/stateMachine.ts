import type { SubscriptionStatus } from "@prisma/client";

// Subscription lifecycle (plus PAUSED, for plans that allow pausing):
//
//   DRAFT ─send_quote→ QUOTATION ─confirm→ CONFIRMED ─activate→ ACTIVE ⇄ PAUSED
//     └───────────── cancel ──────────────────┘          │         │
//                                                  close ↓   close ↓
//                                                       CLOSED ◄───┘
//   ACTIVE ─renew→ ACTIVE (expiry extended by one term)
//
// Pure module: the service supplies the context, this decides. Unit-tested.

export type Action = "send_quote" | "confirm" | "activate" | "pause" | "resume" | "close" | "cancel" | "renew";
export type Actor = "staff" | "customer";

export interface TransitionContext {
  status: SubscriptionStatus;
  plan: { pausable: boolean; closable: boolean; renewable: boolean; price: number };
  lineCount: number;
  quoteExpiresAt: Date | null;
  startDate: Date;
  expiryDate: Date | null;
  today: Date;
}

interface Rule {
  from: SubscriptionStatus[];
  to: SubscriptionStatus;
  label: string;
  actors: Actor[];
  /** Returns a reason the transition is blocked, or null when allowed. */
  guard?: (c: TransitionContext) => string | null;
}

export const RULES: Record<Action, Rule> = {
  send_quote: {
    from: ["DRAFT"],
    to: "QUOTATION",
    label: "Send quotation",
    actors: ["staff"],
    guard: (c) => (c.lineCount === 0 && c.plan.price === 0 ? "Add at least one product line before sending the quotation" : null),
  },
  confirm: {
    from: ["QUOTATION"],
    to: "CONFIRMED",
    label: "Confirm",
    actors: ["staff"],
    guard: (c) => (c.quoteExpiresAt && c.today > c.quoteExpiresAt ? "This quotation has expired; send a new quotation" : null),
  },
  activate: {
    from: ["CONFIRMED"],
    to: "ACTIVE",
    label: "Activate",
    actors: ["staff"],
    guard: (c) => (c.startDate > c.today ? "Starts in the future; it will activate automatically on its start date" : null),
  },
  pause: {
    from: ["ACTIVE"],
    to: "PAUSED",
    label: "Pause",
    actors: ["staff", "customer"],
    guard: (c) => (c.plan.pausable ? null : "This plan does not allow pausing"),
  },
  resume: { from: ["PAUSED"], to: "ACTIVE", label: "Resume", actors: ["staff", "customer"] },
  close: {
    from: ["ACTIVE", "PAUSED"],
    to: "CLOSED",
    label: "Close",
    actors: ["staff", "customer"],
    guard: (c) => (c.plan.closable ? null : "This plan cannot be closed early"),
  },
  cancel: { from: ["DRAFT", "QUOTATION", "CONFIRMED"], to: "CLOSED", label: "Cancel", actors: ["staff"] },
  renew: {
    from: ["ACTIVE"],
    to: "ACTIVE",
    label: "Renew",
    actors: ["staff", "customer"],
    guard: (c) => (!c.plan.renewable ? "This plan cannot be renewed" : !c.expiryDate ? "Open-ended subscriptions do not need renewing" : null),
  },
};

export class TransitionError extends Error {
  constructor(
    message: string,
    public readonly kind: "invalid_state" | "blocked" | "forbidden",
  ) {
    super(message);
  }
}

/** Throws TransitionError when the action is not allowed; returns the target status otherwise. */
export function checkTransition(action: Action, c: TransitionContext, actor: Actor = "staff"): SubscriptionStatus {
  const rule = RULES[action];
  if (!rule.actors.includes(actor)) throw new TransitionError("You cannot perform this action", "forbidden");
  if (!rule.from.includes(c.status)) {
    throw new TransitionError(`Cannot ${rule.label.toLowerCase()} a subscription that is ${c.status.toLowerCase()}`, "invalid_state");
  }
  const blocked = rule.guard?.(c);
  if (blocked) throw new TransitionError(blocked, "blocked");
  return rule.to;
}

/** Actions the actor can take right now — drives which buttons the UI shows. */
export function availableActions(c: TransitionContext, actor: Actor = "staff"): { action: Action; label: string; blockedReason: string | null }[] {
  return (Object.keys(RULES) as Action[])
    .filter((a) => RULES[a].actors.includes(actor) && RULES[a].from.includes(c.status))
    .map((a) => ({ action: a, label: RULES[a].label, blockedReason: RULES[a].guard?.(c) ?? null }));
}

export const EDITABLE_STATUSES: SubscriptionStatus[] = ["DRAFT", "QUOTATION"];
