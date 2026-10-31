import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { AppError, conflict, unauthenticated } from "../../lib/errors.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { sendMail } from "../../lib/mailer.js";
import { evictUserCache, type AuthUser } from "../../middleware/auth.js";

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const toAuthUser = (u: { id: number; email: string; name: string; role: AuthUser["role"]; customerId: number | null }): AuthUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  customerId: u.customerId,
});

/** Self sign-up always creates a CUSTOMER account linked to a new customer record. */
export async function signup(input: { name: string; company?: string; email: string; password: string }): Promise<AuthUser> {
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
        role: "CUSTOMER",
        customer: { create: { name: input.company || input.name, email: input.email } },
      },
    });
    return toAuthUser(user);
  } catch (err) {
    // The UNIQUE index on users.email is the real guarantee — no check-then-insert race.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw conflict("An account with this email already exists");
    }
    throw err;
  }
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({ where: { email } });
  // Same message for unknown email and wrong password: no account enumeration.
  if (!user || !(await verifyPassword(password, user.passwordHash))) throw unauthenticated("Invalid email or password");
  if (!user.isActive) throw new AppError(403, "ACCOUNT_DISABLED", "This account has been deactivated");
  return toAuthUser(user);
}

/** Always resolves, whether or not the email exists. */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, isActive: true } });
  if (!user || !user.isActive) return;

  const token = randomBytes(32).toString("base64url"); // only ever exists in the emailed link
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });

  const link = `${env.CLIENT_URL}/reset-password?token=${token}`;
  await sendMail({
    to: email,
    kind: "password_reset",
    subject: "Reset your Brightloop password",
    text: `Hi ${user.name},\n\nUse this link to set a new password. It expires in 30 minutes and works once:\n${link}\n\nIf you did not ask for this, ignore this email.`,
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError(400, "INVALID_TOKEN", "This reset link is invalid or has expired");
  }
  const passwordHash = await hashPassword(newPassword);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // Conditional claim makes the token single-use even if two requests race.
    const claimed = await tx.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: now } });
    if (claimed.count === 0) throw new AppError(400, "INVALID_TOKEN", "This reset link is invalid or has expired");
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    // Any other outstanding links for this user stop working too.
    await tx.passwordResetToken.updateMany({ where: { userId: record.userId, usedAt: null }, data: { usedAt: now } });
  });
  evictUserCache(record.userId);
}
