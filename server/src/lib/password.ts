import bcrypt from "bcryptjs";
import { z } from "zod";

// Requirement: "more than eight characters, with an uppercase letter, a lowercase letter and a special character".
export const PasswordSchema = z
  .string()
  .min(9, "Password must be more than 8 characters")
  .max(128, "Password is too long")
  .regex(/[A-Z]/, "Password needs an uppercase letter")
  .regex(/[a-z]/, "Password needs a lowercase letter")
  .regex(/[^A-Za-z0-9]/, "Password needs a special character");

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254);

const BCRYPT_COST = 10;

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_COST);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);
