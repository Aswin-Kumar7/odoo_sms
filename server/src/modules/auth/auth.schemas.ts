import { z } from "zod";
import { EmailSchema, PasswordSchema } from "../../lib/password.js";

export const SignupSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(100),
  company: z.string().trim().max(150).optional(),
  email: EmailSchema,
  password: PasswordSchema,
});

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, "Enter your password").max(128),
});

export const ForgotPasswordSchema = z.object({ email: EmailSchema });

export const ResetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: PasswordSchema,
});
