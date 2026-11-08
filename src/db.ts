import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../generated/prisma/client.ts";

export { Prisma };

/** One client per process: each instance owns a connection pool. */
export function createPrisma(connectionString: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export type Db = ReturnType<typeof createPrisma>;
/** The client passed to `db.$transaction(async (tx) => …)`. */
export type Tx = Prisma.TransactionClient;
