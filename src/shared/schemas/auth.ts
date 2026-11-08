// COPIED from frontend/src/lib/schemas/auth.ts by `npm run sync:shared`. Edit the frontend file, not this one.
import { z } from "zod";
import { cafeNameSchema, slugSchema } from "./cafe";

export const PHONE_COUNTRY_CODE = "+91";

/** Keeps the 10 local digits, whether typed plainly, with spaces, or pasted as +91/0-prefixed. */
function toLocalDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/** Input: what the owner types after the +91 prefix. Output: E.164, e.g. +919876543210. */
export const mobileSchema = z
  .string()
  .trim()
  .min(1, "Enter your mobile number")
  .transform(toLocalDigits)
  .pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"))
  .transform((digits) => `${PHONE_COUNTRY_CODE}${digits}`);

export const loginSchema = z.object({
  phone: mobileSchema,
  password: z.string().min(1, "Enter your password"),
});

export const registerSchema = z
  .object({
    ownerName: z
      .string()
      .trim()
      .min(2, "Enter your name")
      .max(60, "Keep your name under 60 characters"),
    phone: mobileSchema,
    password: z
      .string()
      .min(8, "Use at least 8 characters")
      .max(72, "Use 72 characters or fewer")
      .regex(/[a-zA-Z]/, "Include at least one letter")
      .regex(/\d/, "Include at least one number"),
    confirmPassword: z.string().min(1, "Repeat your password"),
    cafeName: cafeNameSchema,
    slug: slugSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  });

export type LoginInput = z.input<typeof loginSchema>;
export type RegisterInput = z.input<typeof registerSchema>;

export type User = {
  id: string;
  name: string;
  /** E.164, e.g. +919876543210 */
  phone: string;
  createdAt: string;
};
