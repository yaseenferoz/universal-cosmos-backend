# Universal Cosmos backend

A modular scientific API for the separate `universal-cosmos-frontend` application. Built with Node.js 24 LTS, TypeScript, Express 5, PostgreSQL, Prisma 7, Zod, Pino, Swagger and Vitest. Exact compatible dependency versions are committed in `package-lock.json`.

Catalogue reads use PostgreSQL. Dedicated ingestion commands normalize selected provider data and persist provenance; Horizons supplies separately cached time-dependent ephemerides. Runtime routes never return hardcoded scientific fixtures.

## Run locally

Install Node.js 24 and either Docker Compose or PostgreSQL 17. From the repository root:

```sh
npm ci
```

Copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell, `cp .env.example .env` on Unix). The example password is disposable local-development configuration; choose your own password and keep `DATABASE_URL` consistent with `POSTGRES_*`.

```sh
docker compose up -d postgres
npm run db:generate
npm run db:deploy
npm run db:seed
npm run dev
```

If PostgreSQL is already installed, configure `DATABASE_URL` for that server and omit the Compose command. Wait for PostgreSQL to be healthy before migrating. The server defaults to `http://localhost:4000`; [Swagger UI](http://localhost:4000/api/v1/docs/) and [OpenAPI JSON](http://localhost:4000/api/v1/openapi.json) are served by the API.

The seed creates the Sun, eight planets and Earth's Moon, with official JPL identifiers and parent relationships. It intentionally supplies no physical measurements. Gaia stars, confirmed exoplanets and media arrive through ingestion. Galaxies and nebulae initially return empty lists; SIMBAD currently supports identity lookup only. No sample records are passed off as catalogue discoveries.

## API

All endpoints use `/api/v1`. Object and asset path identifiers are UUIDs returned by the API, not names or JPL numbers.

| Method and path | Behavior |
| --- | --- |
| `GET /health` | Process liveness |
| `GET /health/ready` | PostgreSQL connectivity; 503 if unavailable |
| `GET /objects` | Paginated objects; optional `objectType`, `parentObjectId` |
| `GET /objects/:id` | Scientific details, measurements, sources and asset summaries |
| `GET /search?q=Earth` | Literal case-insensitive name, slug and external-identifier search |
| `GET /systems/solar` | Stored hierarchy rooted at the Sun |
| `GET /planets`, `/moons`, `/stars` | Paginated type-filtered objects |
| `GET /galaxies`, `/nebulae`, `/exoplanets` | Paginated type-filtered objects |
| `GET /ephemeris/:id` | Validated, cached NASA/JPL state-vector window |
| `GET /assets/:id` | Attributed media metadata and source link |
| `GET /docs/`, `/openapi.json` | Swagger UI and OpenAPI contract |

Lists and search accept `page` (1–1000, default 1) and `pageSize` (1–100, default 20). Search requires a trimmed `q` of 2–100 characters and supports `objectType`. Type-specific routes accept pagination only. Unknown query fields are rejected on validated catalogue/ephemeris routes. Object types are uppercase: `PLANET`, `MOON`, `STAR`, `GALAXY`, `NEBULA`, `EXOPLANET`, `SMALL_BODY`.

```json
{
  "success": true,
  "data": [],
  "meta": {
    "source": "Universal Cosmos",
    "timestamp": "2026-11-02T00:00:00.000Z",
    "pagination": { "page": 1, "pageSize": 20, "total": 0, "totalPages": 0 }
  }
}
```

Errors use `{ "success": false, "error": { "code": "OBJECT_NOT_FOUND", "message": "Celestial object not found" } }` with an appropriate HTTP status. Validation errors include field paths. Internal database errors and credentials are not returned. Each request receives an `X-Request-ID`.

Measurements have explicit `value` and `unit`; missing measurements are `null`. Symmetric uncertainty may be supplied with a measurement, while source-specific/asymmetric uncertainty and limit flags are preserved in the accompanying `uncertainties` object. Read those flags before interpreting a value as a measurement rather than a bound. Coordinate frame, epoch and time scale are retained where known. Object details expose at most 100 rows per related collection, with `relatedRecords` totals/returned counts to disclose truncation. The Solar System response is bounded to 1000 objects and eight hierarchy levels.

## Ephemerides

Set `ASTRONOMY_CONTACT` to your real `mailto:address@example.org` or HTTPS contact page before using JPL. The application-specific User-Agent, caching and serialized requests follow [JPL's fair-use policy](https://ssd-api.jpl.nasa.gov/).

Resolve an object UUID using search, then request a window:

```text
GET /api/v1/ephemeris/<earth-uuid>?start=2026-11-02&stop=2026-11-09&step=6h&center=500%400
```

`start`/`stop` are Gregorian dates at midnight **TDB**, not UTC. `step` is `1h`, `6h` or `1d`; allowed centers are `500@0` (Solar System barycenter), `500@10` (Sun), and `500@399` (Earth). Results are geometric ICRF vectors in the frame plane, km and km/s. This request does not supply covariance or uncertainty bounds.

Windows must span more than zero and at most 366 days, with at most 1000 samples, within application date bounds 1600–2500. Individual targets may support narrower ranges. Missing provider mappings return 422; missing contact returns 503. The default cache retains up to 128 windows for one hour, coalesces duplicate requests, serializes outbound JPL requests, limits the queue to 16 and cools down for 30 seconds after failures. Clients should fetch a window and interpolate locally; do not call this endpoint every animation frame.

## Ingestion

Commands write to the configured database and exit. Start with a small explicit selection:

```sh
npm run ingest -- --help
npm run ingest -- gaia --max-magnitude 8 --limit 100
npm run ingest -- exoplanets --limit 100
npm run ingest -- nasa-media --object-id <object-uuid> --query Saturn --limit 25
npm run ingest -- simbad --identifier "M 31"
```

See [DATA_SOURCES.md](DATA_SOURCES.md) for sky selection, cursor controls, official interfaces, scientific conventions, credits and licenses. The SIMBAD command reports identity/cross-references and does not merge objects automatically. Media ingestion requires an operator-selected object/query association; search relevance alone is not proof that an image depicts the object.

Run catalogue refreshes from cron, Windows Task Scheduler or your deployment scheduler at a provider-appropriate cadence (for example, weekly selected exoplanet refreshes; Gaia DR3 is a fixed release). Do not overlap ingestion jobs. Each run is bounded to at most 10,000 catalogue objects, in batches of at most 500, and returns a cursor for continuation. Re-running a selection updates existing identities and source-specific snapshots. There is no background import triggered by browsing the API, Redis or queue infrastructure.

## Configuration

| Variable | Default / purpose |
| --- | --- |
| `DATABASE_URL` | Required PostgreSQL connection URL; kept only in local/deployment secrets |
| `PORT` | `4000` |
| `NODE_ENV` | `development`, `test` or `production` |
| `FRONTEND_ORIGIN` | `http://localhost:5173`; exact HTTP(S) origin, without trailing slash/path |
| `LOG_LEVEL` | `info`; standard Pino levels or `silent` |
| `TRUST_PROXY_HOPS` | `0`; set only for your known reverse-proxy topology |
| `RATE_LIMIT_MAX` | `120` requests per minute per client IP and API process |
| `UPSTREAM_TIMEOUT_MS` | `10000`; bounds provider fetch and response-body reads |
| `EPHEMERIS_CACHE_TTL_SECONDS` | `3600` |
| `ASTRONOMY_CONTACT` | Required only for Horizons; real `mailto:` or HTTPS contact |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` | Local Compose setup; port defaults to `5432` |
| `TEST_DATABASE_URL` | Opt-in integration test; fresh empty loopback database named `*_test` |

The API uses Helmet, exact-origin CORS, a 32 KiB JSON limit, rate limiting, strict request/environment schemas, bounded upstream response sizes, HTTPS host allowlists, no upstream redirects, and centralized errors. It stores no API keys and needs no authentication for these read-only features. CORS does not authenticate non-browser clients.

## Develop, verify and deploy

```sh
npm run db:validate
npm run typecheck
npm test
npm run build
npm start
```

`npm run check` runs schema validation, type checks, all default tests and the production build. Tests use synthetic fixtures and mocked external services; they do not call NASA, ESA or SIMBAD. `npm run test:db` additionally checks migrations, repeated seeding and real repository queries after you explicitly configure an empty local test database. See [DATABASE.md](DATABASE.md) for its safeguards and migration commands. CI runs both suites against its disposable PostgreSQL service.

Production: install locked dependencies, generate the Prisma client, run checks/build, apply reviewed migrations as a release step, and start `dist/server.js`. Use your deployment secret store and a TLS reverse proxy. SIGINT/SIGTERM drain the HTTP server and disconnect Prisma, with a ten-second shutdown deadline.

Caches and rate limits are per process. For the initial deployment run a single API instance for JPL access; multiple independently fetching instances would violate JPL's one-request-at-a-time rule. Coordinate outbound access before scaling horizontally. The database pool is bounded to 10 connections per process. This initial implementation uses bounded substring search; larger catalogues will need a measured search-index strategy.

Code layout follows [AGENTS.md](AGENTS.md). Type modules share object services/repositories to avoid duplicate business rules. Controllers map validated HTTP inputs into services; repositories own Prisma, adapters own upstream contracts, and workers own ingestion. All seven milestones are implemented, with incremental type/test checks and an actual PostgreSQL migration/seed/query smoke test. Docker Compose itself still needs a local startup check because Docker was unavailable in the implementation environment.
