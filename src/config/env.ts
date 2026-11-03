import { z } from 'zod';

const origin = z.url().refine(value => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && url.origin === value && !url.username && !url.password;
}, 'FRONTEND_ORIGIN must be an HTTP(S) origin without a path');

export const envSchema = z.object({
  DATABASE_URL: z.url().refine(value => URL.canParse(value) && ['postgres:', 'postgresql:'].includes(new URL(value).protocol), 'PostgreSQL URL required'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  FRONTEND_ORIGIN: origin.default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100000).default(120),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(100).max(60000).default(10000),
  EPHEMERIS_CACHE_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(3600),
  ASTRONOMY_CONTACT: z.preprocess(value => value === '' ? undefined : value, z.string().max(200).regex(/^(?:mailto:[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+|https:\/\/[^\s<>]+)$/).optional()),
});
export type Environment = z.infer<typeof envSchema>;
export function loadEnv(input: NodeJS.ProcessEnv = process.env): Environment {
  const result = envSchema.safeParse(input);
  if (!result.success) {
    // Do not include configuration values (especially database credentials) in errors.
    throw new Error(`Invalid environment fields: ${result.error.issues.map(issue => issue.path.join('.')).join(', ')}`);
  }
  return result.data;
}
