# Universal Cosmos backend

## Working rules
- Build a modular monolith using Node.js 24 LTS, TypeScript, Express, PostgreSQL, Prisma, Zod, Pino and Vitest.
- Keep controllers thin, business rules in services, database access in repositories, and external I/O in independent provider adapters.
- Public responses use DTOs and the success/data/meta or success/error envelope. Never expose raw Prisma records or internal errors.
- Scientific values require explicit units, provenance and relevant epoch/frame/uncertainty metadata. Missing measurements stay null; never invent measurements or silently infer distances from parallax.
- Use official provider documentation. Bound queries, response sizes, timeouts and caches. Never accept arbitrary upstream URLs or perform network calls per animation frame.
- Tests mock external services. Keep test fixtures visibly separate from real seed data.
- Do not add authentication, Redis, BullMQ, Kubernetes or microservices without a concrete requirement.
- Never commit secrets, .env, node_modules, generated clients, dist, local databases or data dumps.
- Run `npm run typecheck` and `npm test` at each milestone; run build and Prisma validation before delivery. Document checks that cannot run.

## Development plan
1. Project scaffold, validated configuration, health route, structured logging, centralized errors and graceful shutdown.
2. Prisma schema, migration, PostgreSQL Compose configuration and attributed, idempotent Solar System seed.
3. Database-backed object lists and type-specific routes, Solar System hierarchy, pagination and DTOs.
4. Search, validated object details and asset details.
5. Validated NASA JPL Horizons vector adapter, bounded caching and ephemeris API.
6. NASA media search, bounded Gaia and confirmed-exoplanet ingestion, SIMBAD identification adapter.
7. OpenAPI/Swagger, security checks, automated tests, operational and scientific-source documentation.

## Module boundaries
`src/config` owns runtime configuration; `src/database` owns Prisma lifecycle; `src/modules` owns application use cases; `src/integrations` owns upstream contracts; `src/workers` owns explicit ingestion commands. Public API prefix: `/api/v1`.

## Verification
Use dependency injection for repository/provider tests. Tests must not require live NASA/ESA requests. Database integration checks use a separately provisioned local/test PostgreSQL instance. Do not run migrations or seeds against an unknown database.
