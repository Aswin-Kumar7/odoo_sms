import { z } from 'zod'

// Mirrors server/src/lib/password.ts so the user sees the same rules before submitting.
// The server remains the authority and re-validates every request.
export const PASSWORD_RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: 'More than 8 characters', test: (v) => v.length >= 9 },
  { label: 'An uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { label: 'A lowercase letter', test: (v) => /[a-z]/.test(v) },
  { label: 'A special character', test: (v) => /[^A-Za-z0-9]/.test(v) },
]

export const passwordSchema = z
  .string()
  .min(9, 'Password must be more than 8 characters')
  .max(128)
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/[a-z]/, 'Password needs a lowercase letter')
  .regex(/[^A-Za-z0-9]/, 'Password needs a special character')

export const emailSchema = z.string().trim().email('Enter a valid email address')
