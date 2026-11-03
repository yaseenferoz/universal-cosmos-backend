import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { createPrismaClient } from '../src/database/client.js';
import { createObjectRepository } from '../src/modules/objects/objects.repository.js';
import { objectDetail } from '../src/modules/objects/objects.dto.js';
import { PrismaCatalogRepository } from '../src/modules/catalogs/repository.js';
import { normalizeGaiaRow } from '../src/integrations/esa/gaia/provider.js';
import { normalizeExoplanetRow } from '../src/integrations/exoplanet-archive/provider.js';

const execute = promisify(execFile);
const testUrl = process.env.TEST_DATABASE_URL;

/** Refuse migration of a normal, remote or previously populated database. */
async function requireEmptyLocalTestDatabase(connectionString: string): Promise<void> {
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || !/^\/[a-zA-Z0-9_]+_test$/.test(url.pathname)
      || (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public')) {
    throw new Error('Integration tests require a loopback PostgreSQL URL for a fresh database named *_test using the public schema');
  }
  const client = new Client({ connectionString, connectionTimeoutMillis: 5_000, statement_timeout: 5_000 });
  try {
    await client.connect();
    const existing = await client.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
        AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
    `);
    if (existing.rows[0]?.count !== '0') {
      throw new Error('Integration tests require an empty database; existing data will not be modified or deleted');
    }
  } finally {
    await client.end();
  }
}

// Opt-in: the ordinary mocked suite never needs a server. The test intentionally
// leaves its migrated schema, seed and synthetic import fixtures for inspection.
describe.skipIf(!testUrl)('PostgreSQL integration (explicit empty local test database)', () => {
  it('deploys migrations, seeds, queries and imports catalogue snapshots idempotently', async () => {
    if (!testUrl) throw new Error('TEST_DATABASE_URL is required');
    await requireEmptyLocalTestDatabase(testUrl);
    const env = { ...process.env, DATABASE_URL: testUrl };
    await execute(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env });
    for (let i = 0; i < 2; i++) {
      await execute(process.execPath, ['--import', 'tsx', 'prisma/seed.ts'], { env });
    }

    const db = createPrismaClient(testUrl);
    try {
      expect(await db.celestialObject.count()).toBe(10);
      expect(await db.objectSourceReference.count()).toBe(10);
      expect(await db.physicalProperties.count()).toBe(0);
      const repository = createObjectRepository(db);
      const first = await repository.list({ page: 1, pageSize: 3, objectType: 'PLANET' });
      const second = await repository.list({ page: 2, pageSize: 3, objectType: 'PLANET' });
      expect(first.total).toBe(8);
      expect(first.items).toHaveLength(3);
      expect(second.items).toHaveLength(3);
      expect(second.items.some(a => first.items.some(b => a.id === b.id))).toBe(false);
      expect(await repository.solarSystem()).toHaveLength(10);

      const earth = await repository.list({ page: 1, pageSize: 20, q: 'eArTh' });
      expect(earth.items).toHaveLength(1);
      const detail = await repository.findById(earth.items[0]!.id);
      expect(detail?.sourceReferences[0]?.externalIdentifier).toBe('399');
      expect(detail?.physicalProperties).toBeNull();
      expect(await repository.findById(randomUUID())).toBeNull();
      const sun = await db.celestialObject.findUniqueOrThrow({ where: { slug: 'sun' } });
      const moon = await db.celestialObject.findUniqueOrThrow({ where: { slug: 'moon' } });
      expect(detail?.parentObjectId).toBe(sun.id);
      expect(moon.parentObjectId).toBe(detail?.id);

      expect((await repository.list({ page: 1, pageSize: 20, q: '%' })).items).toHaveLength(0);
      const fixtureId = randomUUID();
      await db.celestialObject.create({
        data: { id: fixtureId, name: 'Synthetic % fixture', slug: `test-${fixtureId}`, objectType: 'SMALL_BODY' },
      });
      try {
        expect((await repository.list({ page: 1, pageSize: 20, q: '%' })).items).toHaveLength(1);
      } finally {
        await db.celestialObject.delete({ where: { id: fixtureId } });
      }

      // Synthetic observations exercise the real normalizer -> PostgreSQL -> DTO
      // path without contacting any astronomy provider.
      const gaia = normalizeGaiaRow({
        designation: 'Gaia DR3 999999999999999999', ra: 12, dec: -3, ref_epoch: 2016,
        ra_error: 0.02, dec_error: 0.03, parallax: -0.5, parallax_error: 0.1,
        pmra: 2, pmdec: -1, pmra_error: 0.04, pmdec_error: 0.05,
        radial_velocity: 30, radial_velocity_error: 0.2,
        phot_g_mean_mag: 7, phot_bp_mean_mag: 7.5, phot_rp_mean_mag: 6.5,
        phot_g_mean_flux: 20, phot_g_mean_flux_error: 0.3,
      });
      gaia.name = 'Synthetic Gaia integration fixture';
      const exoplanet = normalizeExoplanetRow({
        pl_name: 'Synthetic Integration Planet b', hostname: 'Synthetic Integration Star',
        default_flag: 1, soltype: 'Published Confirmed', pl_bmassprov: 'Mass',
        pl_refname: 'SYNTHETIC TEST REFERENCE', rowupdate: '2026-01-01',
        ra: 12, dec: 34, sy_dist: 20, sy_disterr1: 0.4, sy_disterr2: -0.3,
        pl_bmassj: 1.2, pl_bmassjerr1: 0.2, pl_bmassjerr2: -0.1, pl_bmassjlim: 0,
        pl_radj: 1, pl_radjerr1: 0.05, pl_radjerr2: -0.04, pl_radjlim: 0,
        pl_eqt: 800, pl_orbsmax: 0.2, pl_orbsmaxerr1: 0.01, pl_orbsmaxerr2: -0.02,
        pl_orbeccen: 0.1, pl_orbincl: 60, pl_orbper: 10, pl_orblper: 40,
      });
      const imports = new PrismaCatalogRepository(db);
      for (let i = 0; i < 2; i++) {
        await imports.saveObject(gaia);
        await imports.saveObject(exoplanet);
      }
      expect(await db.celestialObject.count()).toBe(12);
      expect(await db.scientificSource.count()).toBe(3);
      expect(await db.objectSourceReference.count()).toBe(12);
      expect(await db.physicalProperties.count()).toBe(2);
      expect(await db.coordinates.count()).toBe(2);
      expect(await db.orbitalElements.count()).toBe(1);

      const gaiaObject = await db.celestialObject.findUniqueOrThrow({
        where: { sourceCatalog_sourceCatalogId: { sourceCatalog: gaia.sourceCatalog, sourceCatalogId: gaia.sourceCatalogId } },
      });
      const planetObject = await db.celestialObject.findUniqueOrThrow({
        where: { sourceCatalog_sourceCatalogId: { sourceCatalog: exoplanet.sourceCatalog, sourceCatalogId: exoplanet.sourceCatalogId } },
      });
      const gaiaRecord = (await repository.findById(gaiaObject.id))!;
      const planetRecord = (await repository.findById(planetObject.id))!;
      expect(gaiaRecord.sourceCatalogId).toBe('999999999999999999');
      expect(gaiaRecord.coordinates).toHaveLength(1);
      expect(gaiaRecord.sourceReferences).toHaveLength(1);
      expect(gaiaRecord.coordinates[0]).toMatchObject({
        parallax: -0.5, parallaxError: 0.1, parallaxUnit: 'mas', distance: null,
        properMotionRa: 2, properMotionRaError: 0.04, properMotionUnit: 'mas/yr',
        epoch: 2016, epochFormat: 'Julian year (TCB)', coordinateFrame: 'ICRS',
      });
      expect(gaiaRecord.physicalProperties?.propertiesJson).toMatchObject({
        photometricFluxes: { g: { value: 20, uncertainty: 0.3, unit: 'electron/s' } },
      });
      const gaiaDto = objectDetail(gaiaRecord);
      expect(gaiaDto.coordinates[0]?.parallax).toEqual({ value: -0.5, unit: 'mas', uncertainty: 0.1 });
      expect(gaiaDto.coordinates[0]?.distance).toBeNull();
      expect(gaiaDto.sources[0]).toMatchObject({ externalIdentifier: '999999999999999999', provider: 'ESA/Gaia/DPAC', dataVersion: 'DR3' });
      expect(gaiaDto.relatedRecords.coordinates).toEqual({ total: 1, returned: 1 });

      expect(planetRecord.coordinates).toHaveLength(1);
      expect(planetRecord.orbitalElements).toHaveLength(1);
      expect(planetRecord.sourceReferences).toHaveLength(1);
      expect(planetRecord.physicalProperties).toMatchObject({ mass: 1.2, massUnit: 'M_jup', radius: 1, radiusUnit: 'R_jup' });
      expect(planetRecord.physicalProperties?.uncertaintyJson).toMatchObject({ mass: { upper: 0.2, lower: -0.1, limitFlag: 0 } });
      expect(planetRecord.orbitalElements[0]).toMatchObject({ semiMajorAxis: 0.2, semiMajorAxisUnit: 'au', orbitalPeriod: 10, orbitalPeriodUnit: 'day', epoch: null, referenceFrame: null });
      const planetDto = objectDetail(planetRecord);
      expect(planetDto.physicalProperties?.mass).toMatchObject({ value: 1.2, unit: 'M_jup' });
      expect(planetDto.physicalProperties?.uncertainties).toMatchObject({ radius: { upper: 0.05, lower: -0.04, limitFlag: 0 } });
      expect(planetDto.coordinates[0]?.uncertainties).toMatchObject({ distance: { upper: 0.4, lower: -0.3, unit: 'pc' } });
      expect(planetDto.orbitalElements[0]?.uncertainties).toMatchObject({ semiMajorAxis: { upper: 0.01, lower: -0.02 } });
      expect(planetDto.sources[0]).toMatchObject({ provider: 'NASA/IPAC', dataVersion: 'ps; default_flag=1', externalIdentifier: 'Synthetic Integration Planet b' });
      expect(planetDto.relatedRecords.orbitalElements).toEqual({ total: 1, returned: 1 });
    } finally {
      await db.$disconnect();
    }
  }, 60_000);
});
