import { z } from "zod";
import { AppError, fromZodError } from "@shared/errors";

/** Parses a request body (or any input) with a shared schema; throws VALIDATION with field errors. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw fromZodError(result.error);
  return result.data;
}

/** Body of the "move up/down" endpoints for sections and dishes. */
export const moveSchema = z.object({ direction: z.enum(["up", "down"], { error: "Direction must be up or down" }) });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route ids are UUIDs; anything else can't exist, so treat it as not found (not a 500 from Postgres). */
export function assertId(id: string | undefined, what: string): string {
  if (!id || !UUID.test(id)) throw new AppError("NOT_FOUND", `This ${what} doesn't exist.`);
  return id;
}
