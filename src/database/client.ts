import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/** Each process owns one client and calls $disconnect() during shutdown. */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 15_000,
  });

  return new PrismaClient({
    adapter,
    errorFormat: 'minimal',
    transactionOptions: { maxWait: 5_000, timeout: 15_000 },
  });
}
