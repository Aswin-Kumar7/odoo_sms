import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { ah } from "../../lib/http.js";
import { clearSession, issueSession, requireAuth } from "../../middleware/auth.js";
import { ForgotPasswordSchema, LoginSchema, ResetPasswordSchema, SignupSchema } from "./auth.schemas.js";
import * as auth from "./auth.service.js";

export const authRouter = Router();

// Slows brute-force and reset-email abuse. In-memory store: per instance, fine for one node.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many attempts, please try again later", details: null } });
  },
});

authRouter.post(
  "/signup",
  authLimiter,
  ah(async (req, res) => {
    const user = await auth.signup(SignupSchema.parse(req.body));
    issueSession(res, user.id);
    res.status(201).json({ user });
  }),
);

authRouter.post(
  "/login",
  authLimiter,
  ah(async (req, res) => {
    const { email, password } = LoginSchema.parse(req.body);
    const user = await auth.login(email, password);
    issueSession(res, user.id);
    res.json({ user });
  }),
);

authRouter.post("/logout", (_req, res) => {
  clearSession(res);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

authRouter.post(
  "/forgot-password",
  authLimiter,
  ah(async (req, res) => {
    const { email } = ForgotPasswordSchema.parse(req.body);
    await auth.requestPasswordReset(email);
    res.json({ message: "If an account exists for this email, a reset link has been sent." });
  }),
);

authRouter.post(
  "/reset-password",
  authLimiter,
  ah(async (req, res) => {
    const { token, password } = ResetPasswordSchema.parse(req.body);
    await auth.resetPassword(token, password);
    res.json({ message: "Password updated. You can sign in now." });
  }),
);
