import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { Router } from 'express';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';

const config = loadEnv({ DATABASE_URL: 'postgresql://test:test@localhost:5432/cosmos_test', NODE_ENV: 'test', LOG_LEVEL: 'silent' });
describe('HTTP foundation', () => {
  it('reports liveness with security headers and request IDs', async () => {
    const res = await request(createApp({ config })).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { status: 'ok' }, meta: { source: 'Universal Cosmos' } });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
  it('distinguishes database readiness from liveness', async () => {
    expect((await request(createApp({ config })).get('/api/v1/health/ready')).status).toBe(503);
    expect((await request(createApp({ config, readiness: async () => {} })).get('/api/v1/health/ready')).status).toBe(200);
  });
  it('returns consistent errors and hides internal information', async () => {
    const router = Router(); router.get('/fail', () => { throw new Error('secret password'); });
    const app = createApp({ config, apiRouter: router });
    expect((await request(app).get('/missing')).body.error.code).toBe('ROUTE_NOT_FOUND');
    const res = await request(app).get('/api/v1/fail');
    expect(res.status).toBe(500); expect(JSON.stringify(res.body)).not.toContain('secret');
  });
  it('rejects disallowed origins, malformed JSON and oversized bodies', async () => {
    const app = createApp({ config });
    expect((await request(app).get('/api/v1/health').set('Origin', 'https://evil.example')).status).toBe(403);
    expect((await request(app).post('/anything').set('Content-Type', 'application/json').send('{')).body.error.code).toBe('INVALID_JSON');
    expect((await request(app).post('/anything').send({ data: 'x'.repeat(33000) })).status).toBe(413);
  });
  it('rate limits with the common error envelope', async () => {
    const app = createApp({ config: { ...config, RATE_LIMIT_MAX: 1 } });
    await request(app).get('/api/v1/health');
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(429); expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });
  it('rejects invalid environment without revealing its values', () => {
    expect(() => loadEnv({ DATABASE_URL: 'secret-value' })).toThrow('Invalid environment fields: DATABASE_URL');
  });
});
