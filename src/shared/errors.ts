// COPIED from frontend/src/lib/errors.ts by `npm run sync:shared`. Edit the frontend file, not this one.
import type { z } from "zod";

export type AppErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  /** The server couldn't be reached (offline, server down). */
  | "NETWORK"
  | "UNKNOWN";

export type FieldErrors = Record<string, string>;

/**
 * The single error type shared by the API and the frontend. The API sends it as
 * `{ error: { code, message, fieldErrors } }`; the frontend rebuilds it from that, so UI code
 * can rely on `code` for branching and `fieldErrors` for mapping onto form inputs.
 */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly fieldErrors?: FieldErrors;

  constructor(
    code: AppErrorCode,
    message: string,
    options?: { fieldErrors?: FieldErrors; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "AppError";
    this.code = code;
    this.fieldErrors = options?.fieldErrors;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function fromZodError(error: z.ZodError): AppError {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "root";
    fieldErrors[key] ??= issue.message;
  }
  return new AppError("VALIDATION", "Some fields need attention.", {
    fieldErrors,
    cause: error,
  });
}

export function getErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Try again.",
): string {
  if (isAppError(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
