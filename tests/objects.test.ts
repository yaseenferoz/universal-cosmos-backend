import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createApiRouter } from '../src/routes.js';
import { loadEnv } from '../src/config/env.js';
import { ObjectService } from '../src/modules/objects/objects.service.js';
import type { ObjectRecord, ObjectRepository } from '../src/modules/objects/objects.repository.js';
import { AssetService } from '../src/modules/assets/assets.service.js';

// Synthetic fixtures: never used as runtime catalogue data.
const fixture: ObjectRecord = {
  id: '6c9a55ca-46a6-48f3-a349-beb6d0219f7b', name: 'Fixture Earth', slug: 'fixture-earth', objectType: 'PLANET',
  description: 'Synthetic test fixture', parentObjectId: null, sourceCatalog: 'TEST', sourceCatalogId: 'fixture-1',
  createdAt: new Date('2025-01-01'), updatedAt: new Date('2025-01-01'),
  physicalProperties: null, coordinates: [], orbitalElements: [], sourceReferences: [], assets: [],
  _count: { orbitalElements: 0, coordinates: 0, sourceReferences: 0, assets: 0 },
};
const config = loadEnv({ DATABASE_URL: 'postgresql://test:test@localhost:5432/cosmos_test', NODE_ENV: 'test', LOG_LEVEL: 'silent' });
function setup() {
  const repository: ObjectRepository = {
    list: vi.fn(async () => ({ items: [fixture], total: 41 })),
    findById: vi.fn(async () => fixture),
    solarSystem: vi.fn(async () => [{ ...fixture, slug: 'sun', objectType: 'STAR' as const }]),
  };
  const assets = { findById: vi.fn(async () => null) };
  const apiRouter = createApiRouter({ objects: new ObjectService(repository), assets: new AssetService(assets) });
  return { app: createApp({ config, apiRouter }), repository, assets };
}
describe('Catalogue API', () => {
  it('paginates database results and returns an explicit summary DTO', async () => {
    const { app, repository } = setup();
    const res = await request(app).get('/api/v1/objects?page=2&pageSize=20');
    expect(res.status).toBe(200);
    expect(repository.list).toHaveBeenCalledWith({ page: 2, pageSize: 20 });
    expect(res.body.meta.pagination).toEqual({ page: 2, pageSize: 20, total: 41, totalPages: 3 });
    expect(res.body.data[0]).not.toHaveProperty('createdAt');
    expect(res.body.data[0].catalogue.identifier).toBe('fixture-1');
  });
  it.each(['page=0', 'pageSize=101', 'page=1.5', 'page=nope', 'pageSize=', 'page=1&page=2', 'objectType=INVALID'])('rejects invalid pagination/filter %s', async query => {
    const { app, repository } = setup();
    const res = await request(app).get(`/api/v1/objects?${query}`);
    expect(res.status).toBe(400); expect(repository.list).not.toHaveBeenCalled();
  });
  it.each([['planets', 'PLANET'], ['moons', 'MOON'], ['stars', 'STAR'], ['galaxies', 'GALAXY'], ['nebulae', 'NEBULA'], ['exoplanets', 'EXOPLANET']])('filters %s by its own type', async (path, objectType) => {
    const { app, repository } = setup();
    expect((await request(app).get(`/api/v1/${path}`)).status).toBe(200);
    expect(repository.list).toHaveBeenCalledWith({ page: 1, pageSize: 20, objectType });
    expect((await request(app).get(`/api/v1/${path}?objectType=MOON`)).status).toBe(400);
  });
  it('returns details and preserves unknown measurements as null', async () => {
    const { app } = setup();
    const res = await request(app).get(`/api/v1/objects/${fixture.id}`);
    expect(res.status).toBe(200); expect(res.body.data.physicalProperties).toBeNull();
    expect(res.body.data).not.toHaveProperty('sourceReferences');
  });
  it('validates IDs and handles missing objects and assets', async () => {
    const { app, repository } = setup();
    vi.mocked(repository.findById).mockResolvedValue(null);
    expect((await request(app).get('/api/v1/objects/not-a-uuid')).status).toBe(400);
    expect((await request(app).get(`/api/v1/objects/${fixture.id}`)).body.error.code).toBe('OBJECT_NOT_FOUND');
    expect((await request(app).get(`/api/v1/assets/${fixture.id}`)).body.error.code).toBe('ASSET_NOT_FOUND');
  });
  it('returns a database-backed Solar System hierarchy', async () => {
    const { app, repository } = setup();
    const res = await request(app).get('/api/v1/systems/solar');
    expect(res.body.data.rootObjectId).toBe(fixture.id);
    expect(repository.solarSystem).toHaveBeenCalledOnce();
  });
});
describe('Search', () => {
  it.each(['', '?q=', '?q=a', '?q=%20%20', '?q=ea&q=ma', '?q=ea&extra=value', '?q=%00x'])('validates queries %s', async query => {
    const { app, repository } = setup();
    const res = await request(app).get(`/api/v1/search${query}`);
    expect(res.status).toBe(400); expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(repository.list).not.toHaveBeenCalled();
  });
  it('trims a valid search and forwards type/pagination', async () => {
    const { app, repository } = setup();
    const res = await request(app).get('/api/v1/search?q=%20Earth%20&objectType=PLANET&pageSize=5');
    expect(res.status).toBe(200); expect(repository.list).toHaveBeenCalledWith({ q: 'Earth', objectType: 'PLANET', page: 1, pageSize: 5 });
  });
});
