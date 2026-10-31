import type { RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { env, isProd } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { forbidden, unauthenticated } from "../lib/errors.js";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  customerId: number | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const AUTH_COOKIE = "bl_session";
const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000;

export function issueSession(res: Response, userId: number) {
  const token = jwt.sign({ sub: String(userId) }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] });
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true, // not readable from JavaScript → XSS cannot steal it
    sameSite: "lax", // not sent on cross-site POSTs → CSRF mitigation
    secure: isProd,
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/",
  });
}

export function clearSession(res: Response) {
  res.clearCookie(AUTH_COOKIE, { path: "/" });
}

// The JWT only carries the user id. Role and active flag are read from the DB so that
// deactivating a user or changing a role takes effect quickly. A 30-second in-process
// cache avoids one extra DB round trip on every request; user updates evict it.
const USER_CACHE_TTL_MS = 30_000;
const userCache = new Map<number, { user: AuthUser | null; expires: number }>();

export function evictUserCache(userId: number) {
  userCache.delete(userId);
}

async function loadUser(userId: number): Promise<AuthUser | null> {
  const hit = userCache.get(userId);
  if (hit && hit.expires > Date.now()) return hit.user;
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, customerId: true, isActive: true },
  });
  const user = row && row.isActive ? { id: row.id, email: row.email, name: row.name, role: row.role, customerId: row.customerId } : null;
  userCache.set(userId, { user, expires: Date.now() + USER_CACHE_TTL_MS });
  return user;
}

/** Populates req.user when a valid session cookie is present; never rejects. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    const user = await loadUser(Number(payload.sub));
    if (user) req.user = user;
    next();
  } catch (err) {
    // Expired or tampered token → treat as anonymous. DB errors propagate.
    if (err instanceof jwt.JsonWebTokenError) return next();
    next(err);
  }
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  next(req.user ? undefined : unauthenticated());
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(unauthenticated());
    next(roles.includes(req.user.role) ? undefined : forbidden());
  };
