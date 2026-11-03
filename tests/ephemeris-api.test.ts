import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { Router } from 'express';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { createEphemerisRouter } from '../src/modules/ephemeris/ephemeris.routes.js';
import { EphemerisService } from '../src/modules/ephemeris/ephemeris.service.js';
import { ObjectService } from '../src/modules/objects/objects.service.js';
import type { ObjectRecord } from '../src/modules/objects/objects.repository.js';
import type { EphemerisResult } from '../src/integrations/types.js';
import { AppError } from '../src/utils/errors.js';

const id = '6c9a55ca-46a6-48f3-a349-beb6d0219f7b';
const object: ObjectRecord = { id, name: 'Synthetic Earth', slug: 'synthetic-earth', objectType: 'PLANET', description: 'Test fixture', parentObjectId: null, sourceCatalog: 'JPL_HORIZONS', sourceCatalogId: '399', createdAt: new Date(), updatedAt: new Date(), coordinates: [], orbitalElements: [], physicalProperties: null, sourceReferences: [], assets: [], _count: { orbitalElements: 0, coordinates: 0, sourceReferences: 0, assets: 0 } };
function setup(record: ObjectRecord | null = object) {
  const findById = vi.fn(async () => record);
  const objects = new ObjectService({ findById, list: vi.fn(), solarSystem: vi.fn() });
  const getEphemeris = vi.fn(async (): Promise<EphemerisResult> => ({ targetId: '399', center: '500@0', timeScale: 'TDB', referenceFrame: 'ICRF', referencePlane: 'FRAME', correction: 'NONE', units: { position: 'km', velocity: 'km/s', epoch: 'Julian day (TDB)' }, start: '2026-01-01', stop: '2026-01-02', step: '1d', samples: [], source: { provider: 'TEST NASA/JPL', sourceUrl: 'https://ssd.jpl.nasa.gov/api/horizons.api', dataVersion: '1.3', retrievedAt: new Date().toISOString(), attribution: 'Synthetic test' } }));
  const router = Router(); router.use('/ephemeris', createEphemerisRouter(new EphemerisService(objects, { getEphemeris })));
  const config = loadEnv({ DATABASE_URL: 'postgresql://test:test@localhost/cosmos_test', NODE_ENV: 'test', LOG_LEVEL: 'silent' });
  return { app: createApp({ config, apiRouter: router }), findById, getEphemeris };
}
describe('Ephemeris API', () => {
  it('resolves a database object to its provider identifier', async () => {
    const { app, getEphemeris } = setup();
    const res = await request(app).get(`/api/v1/ephemeris/${id}?start=2026-01-01&stop=2026-01-02`);
    expect(res.status).toBe(200); expect(res.body.data.objectId).toBe(id);
    expect(getEphemeris).toHaveBeenCalledWith({ targetId: '399', start: '2026-01-01', stop: '2026-01-02', step: '1d', center: '500@0' });
  });
  it.each(['start=2026-02-30&stop=2026-03-02', 'start=2026-01-02&stop=2026-01-01', 'start=2026-01-01&stop=2026-12-31&step=1h', 'start=2026-01-01&stop=2026-01-02&targetId=499'])('validates before database/provider work: %s', async query => {
    const { app, findById, getEphemeris } = setup();
    expect((await request(app).get(`/api/v1/ephemeris/${id}?${query}`)).status).toBe(400);
    expect(findById).not.toHaveBeenCalled(); expect(getEphemeris).not.toHaveBeenCalled();
  });
  it('handles unavailable targets and provider timeouts', async () => {
    const query = `?start=2026-01-01&stop=2026-01-02`;
    expect((await request(setup(null).app).get(`/api/v1/ephemeris/${id}${query}`)).status).toBe(404);
    expect((await request(setup({ ...object, sourceCatalog: null }).app).get(`/api/v1/ephemeris/${id}${query}`)).status).toBe(422);
    const { app, getEphemeris } = setup();
    getEphemeris.mockRejectedValue(new AppError(504, 'PROVIDER_TIMEOUT', 'Scientific data provider request timed out'));
    expect((await request(app).get(`/api/v1/ephemeris/${id}${query}`)).status).toBe(504);
  });
});
