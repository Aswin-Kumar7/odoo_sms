import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export interface ActivityEntry {
  entityType: "subscription" | "invoice" | "payment" | "discount";
  entityId: number;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  userId?: number | null;
  meta?: Prisma.InputJsonValue;
}

/** Writes an audit-trail entry inside the caller's transaction, so it commits with the change. */
export function logActivity(tx: Tx, e: ActivityEntry) {
  return tx.activityLog.create({
    data: {
      entityType: e.entityType,
      entityId: e.entityId,
      action: e.action,
      fromStatus: e.fromStatus ?? null,
      toStatus: e.toStatus ?? null,
      userId: e.userId ?? null,
      meta: e.meta,
    },
  });
}
