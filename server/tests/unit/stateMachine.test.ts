import { describe, expect, it } from "vitest";
import { availableActions, checkTransition, TransitionError, type TransitionContext } from "../../src/modules/subscriptions/stateMachine.js";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

const ctx = (over: Partial<TransitionContext> = {}): TransitionContext => ({
  status: "DRAFT",
  plan: { pausable: true, closable: true, renewable: true, price: 0 },
  lineCount: 1,
  quoteExpiresAt: null,
  startDate: d("2026-10-01"),
  expiryDate: null,
  today: d("2026-10-31"),
  ...over,
});

const blocked = (fn: () => unknown, kind: TransitionError["kind"]) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(TransitionError);
    expect((e as TransitionError).kind).toBe(kind);
    return;
  }
  throw new Error("expected the transition to be rejected");
};

describe("happy path Draft → Quotation → Confirmed → Active → Closed", () => {
  it("moves through every listed state", () => {
    expect(checkTransition("send_quote", ctx())).toBe("QUOTATION");
    expect(checkTransition("confirm", ctx({ status: "QUOTATION", quoteExpiresAt: d("2026-11-14") }))).toBe("CONFIRMED");
    expect(checkTransition("activate", ctx({ status: "CONFIRMED" }))).toBe("ACTIVE");
    expect(checkTransition("close", ctx({ status: "ACTIVE" }))).toBe("CLOSED");
  });
});

describe("invalid states", () => {
  it("cannot confirm a draft or activate a closed subscription", () => {
    blocked(() => checkTransition("confirm", ctx({ status: "DRAFT" })), "invalid_state");
    blocked(() => checkTransition("activate", ctx({ status: "CLOSED" })), "invalid_state");
    blocked(() => checkTransition("resume", ctx({ status: "ACTIVE" })), "invalid_state");
  });
});

describe("guards", () => {
  it("needs a line or a plan fee before quoting", () => {
    blocked(() => checkTransition("send_quote", ctx({ lineCount: 0 })), "blocked");
    expect(checkTransition("send_quote", ctx({ lineCount: 0, plan: { pausable: false, closable: true, renewable: true, price: 1000 } }))).toBe("QUOTATION");
  });

  it("rejects an expired quotation, accepts on its last valid day", () => {
    blocked(() => checkTransition("confirm", ctx({ status: "QUOTATION", quoteExpiresAt: d("2026-10-30") })), "blocked");
    expect(checkTransition("confirm", ctx({ status: "QUOTATION", quoteExpiresAt: d("2026-10-31") }))).toBe("CONFIRMED");
  });

  it("does not activate before the start date", () => {
    blocked(() => checkTransition("activate", ctx({ status: "CONFIRMED", startDate: d("2026-11-15") })), "blocked");
  });

  it("respects the plan's pause, close and renew flags", () => {
    const strict = { pausable: false, closable: false, renewable: false, price: 0 };
    blocked(() => checkTransition("pause", ctx({ status: "ACTIVE", plan: strict })), "blocked");
    blocked(() => checkTransition("close", ctx({ status: "ACTIVE", plan: strict })), "blocked");
    blocked(() => checkTransition("renew", ctx({ status: "ACTIVE", plan: strict, expiryDate: d("2027-10-01") })), "blocked");
  });

  it("renewing needs an expiry date", () => {
    blocked(() => checkTransition("renew", ctx({ status: "ACTIVE" })), "blocked");
    expect(checkTransition("renew", ctx({ status: "ACTIVE", expiryDate: d("2027-10-01") }))).toBe("ACTIVE");
  });

  it("cancel works before activation regardless of the closable flag", () => {
    const strict = { pausable: false, closable: false, renewable: false, price: 0 };
    expect(checkTransition("cancel", ctx({ status: "CONFIRMED", plan: strict }))).toBe("CLOSED");
  });
});

describe("actors", () => {
  it("customers can pause/close their own but not confirm or activate", () => {
    expect(checkTransition("pause", ctx({ status: "ACTIVE" }), "customer")).toBe("PAUSED");
    blocked(() => checkTransition("confirm", ctx({ status: "QUOTATION" }), "customer"), "forbidden");
  });

  it("lists available actions with blocked reasons", () => {
    const actions = availableActions(ctx({ status: "ACTIVE", plan: { pausable: false, closable: true, renewable: true, price: 0 } }));
    expect(actions.map((a) => a.action)).toEqual(["pause", "close", "renew"]);
    expect(actions.find((a) => a.action === "pause")!.blockedReason).toMatch(/does not allow pausing/);
    expect(actions.find((a) => a.action === "close")!.blockedReason).toBeNull();
  });
});
