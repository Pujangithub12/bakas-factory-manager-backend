import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

// A small pool is enough for one factory: a sync pull runs a few dozen reads at once, so allow that many.
// A call that cannot get a connection fails after 10 seconds instead of hanging, and idle ones are closed.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX) || 15,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export const prisma = new PrismaClient({ adapter });
