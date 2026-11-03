import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // No fallback credentials. Schema generation/validation works without a DB;
  // migration commands require DATABASE_URL to be explicitly configured.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
