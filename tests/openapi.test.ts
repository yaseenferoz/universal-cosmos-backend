import { describe, expect, it } from 'vitest';
import SwaggerParser from '@apidevtools/swagger-parser';
import request from 'supertest';
import { openApiDocument } from '../src/config/openapi.js';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';

describe('API documentation', () => {
  it('validates the OpenAPI document and all schema references', async () => {
    const result = await SwaggerParser.validate(JSON.parse(JSON.stringify(openApiDocument)));
    expect(result.info.title).toBe('Universal Cosmos API');
  });
  it('serves Swagger UI and covers every required endpoint', async () => {
    const app = createApp({ config: loadEnv({ DATABASE_URL: 'postgresql://test:test@localhost/cosmos_test', NODE_ENV: 'test', LOG_LEVEL: 'silent' }) });
    const res = await request(app).get('/api/v1/openapi.json');
    expect(res.status).toBe(200);
    for (const path of ['/health', '/objects', '/objects/{id}', '/search', '/systems/solar', '/planets', '/moons', '/stars', '/galaxies', '/nebulae', '/exoplanets', '/ephemeris/{id}', '/assets/{id}']) expect(res.body.paths[path].get).toBeDefined();
    const docs = await request(app).get('/api/v1/docs/');
    expect(docs.status).toBe(200); expect(docs.text).toContain('swagger-ui');
    expect((await request(app).get('/api/v1/docs/swagger-ui-init.js')).status).toBe(200);
  });
});
