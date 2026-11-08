import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError, isAppError, type AppErrorCode } from "@shared/errors";
import { Prisma } from "../db.ts";

const STATUS: Record<AppErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  NETWORK: 503,
  UNKNOWN: 500,
};

type BodyParserError = Error & { type?: string; status?: number };

/** Turns anything thrown into an AppError plus HTTP status. Unknown errors never leak details. */
function normalize(error: unknown): { appError: AppError; status: number; unexpected: boolean } {
  if (isAppError(error)) return { appError: error, status: STATUS[error.code], unexpected: false };

  const bodyError = error as BodyParserError;
  if (bodyError?.type === "entity.parse.failed") {
    return { appError: new AppError("VALIDATION", "The request body isn't valid JSON."), status: 400, unexpected: false };
  }
  if (bodyError?.type === "entity.too.large") {
    return { appError: new AppError("VALIDATION", "That request is too large. Try a smaller image."), status: 413, unexpected: false };
  }

  // A unique index caught a race that the service's own checks missed.
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return { appError: new AppError("CONFLICT", "That's already in use. Try a different value."), status: 409, unexpected: false };
  }

  return {
    appError: new AppError("UNKNOWN", "Something went wrong on our side. Try again in a moment."),
    status: 500,
    unexpected: true,
  };
}

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);
  const { appError, status, unexpected } = normalize(error);
  if (unexpected) console.error(`[api] ${req.method} ${req.originalUrl} failed:`, error);
  res.status(status).json({
    error: { code: appError.code, message: appError.message, fieldErrors: appError.fieldErrors },
  });
};

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError("NOT_FOUND", "There's nothing at this address."));
};
