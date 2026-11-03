# Database

PostgreSQL stores catalogue records. Time-dependent Horizons vectors are fetched through their separate provider/cache and are not written into catalogue coordinates.

## Local setup

Install Docker with Compose, or provision PostgreSQL 17 locally. Copy `.env.example` to `.env`, replace its disposable example password with a local `POSTGRES_PASSWORD`, and set `DATABASE_URL` to the matching PostgreSQL connection URL. URL-encode reserved characters in a connection-string password. No real credentials are shipped in the repository.

```sh
docker compose up -d postgres
npm run db:generate
npm run db:migrate
npm run db:seed
```

The Compose service binds only to `127.0.0.1` and uses a persistent named volume. `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_PORT` configure it. Changing these after the volume is initialized does not change existing PostgreSQL users or passwords. Do not delete the volume to resolve this unless loss of its contents is intended.

For a new schema change, run `npx prisma migrate dev --name descriptive_change` against your development database, then review and commit its SQL. This can require permission to create a shadow database. For an already prepared migration, `npx prisma migrate deploy` applies committed migrations without a shadow database. `npx prisma validate` and `npx prisma generate` do not need a live PostgreSQL server. Prisma 7 reads connection configuration from `prisma.config.ts`; runtime uses the `@prisma/adapter-pg` driver adapter.

## Data model

| Model | Purpose |
| --- | --- |
| `CelestialObject` | Stable UUID, display name, unique slug, type, optional parent and catalogue identity |
| `PhysicalProperties` | One current normalized physical record; typed mass, size, density, temperature, luminosity, spectrum and Gaia photometry |
| `OrbitalElements` | Source-specific orbital solutions with units, epoch, time scale and reference frame |
| `Coordinates` | Source-specific astrometry with typed parallax, proper-motion and velocity measurements and uncertainties |
| `ScientificSource` | Provider, source URL, attribution, release/version and known license |
| `ObjectSourceReference` | Object/provider identifiers and last import timestamp |
| `Asset` | Media metadata, credit, licensing, origin URL and optional storage key |

Catalogue/source identifiers are strings: Gaia source IDs exceed JavaScript's safe integer range. Nullable values mean unavailable, not zero. Floating-point columns preserve provider precision suitable for discovery and visualization; this API is not a navigation or metrology system. Object/source identities, slugs and asset-origin pairs are unique. Object type/name, hierarchy, foreign keys and sky coordinates are indexed. The initial name search uses bounded case-insensitive matching; a database search index can be added when catalogue size warrants it.

Units are stored beside typed values. The initial defaults are kg, km, kg/m3, K and W for physical properties; degrees and au for orbital elements; degrees, pc, mas, mas/yr and km/s for coordinates. Adapters may retain source units by setting the corresponding unit column explicitly. No implicit conversion or inverse-parallax distance estimation occurs. Right-ascension proper motion from Gaia is `mu_alpha*` (including cos(declination)), not raw dRA/dt. Gaia G/BP/RP photometry is in the Gaia bandpass magnitude system.

Coordinate epoch is a Julian year by default (e.g. Gaia DR3 2016.0); an orbital epoch is a Julian Day with an explicitly supplied time scale when known. Null epoch or frame means the provider did not supply enough information; ingestion must not fabricate them. JSON fields are reserved for additional measurements and structured uncertainty/provenance metadata, rather than replacing core typed measurements. Imported solutions can be replaced atomically by source during refresh. Physical properties are one current curated record, so an importer must document precedence before combining multiple providers for the same object.

## Seed and lifecycle

The idempotent seed writes actual identities for the Sun, eight planets and Earth's Moon, linked by their hierarchy and official JPL Horizons planet-center identifiers. It deliberately leaves measured properties and coordinates absent. It is not mock scientific data. Source: [JPL Horizons object selection](https://ssd.jpl.nasa.gov/horizons/manual.html#select).

Seed and ingestion commands require an explicit database URL and must be directed only at a database you intend to modify. Child measurement rows are deleted with an object; deleting a parent detaches its children, and scientific sources with object references cannot be deleted. Back up PostgreSQL before production migrations and run migrations as a release step, not independently from every API process.

## Opt-in database integration test

Create a new empty local database with a name ending `_test` and set `TEST_DATABASE_URL` explicitly. Then run `npm run test:db`. The test refuses non-loopback servers, a non-public schema or a database with existing user tables, sequences or views. It applies the committed migration, seeds twice, and verifies actual repository queries. It also imports synthetic Gaia and exoplanet measurements twice and checks stable row counts, exact identifiers, units, uncertainties, source references and public DTOs. It leaves the schema, 10 seeded identities and 2 clearly named synthetic integration fixtures for inspection, so the next run needs a new empty test database. It never drops a database or resets an existing one. The default `npm test` suite skips this integration test when `TEST_DATABASE_URL` is absent.

The schema was validated and the client/migration generated with Prisma 7.10.1. A temporary PostgreSQL 17 instance was then used to verify migration deployment, two consecutive idempotent seed runs, database-backed pagination, details with source references, literal wildcard search and the recursive Solar System hierarchy. That test server was stopped afterward. Docker/Compose was not available in the implementation workspace, so the Compose startup path itself remains unverified. Normal local development still requires provisioning PostgreSQL as described above.
