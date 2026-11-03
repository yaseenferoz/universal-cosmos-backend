import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HorizonsProvider, horizonsInputSchema, parseVectorTable } from '../src/integrations/nasa/horizons/index.js';

// Synthetic protocol fixture for parser tests; these are not astronomical measurements.
const fixture = {
  signature: { version: '1.3', source: 'NASA/JPL Horizons API' },
  result: '\n$$SOE\n2461041.5, A.D. 2026-Jan-01 00:00:00.0000, 1.2E+08, -2.0E+07, 3.0E+02, 1.0E+00, 2.0E+00, -3.0E+00,\n2461042.5, A.D. 2026-Jan-02 00:00:00.0000, 1.3E+08, -2.1E+07, 3.1E+02, 1.1E+00, 2.1E+00, -3.1E+00,\n$$EOE\n',
};
const input = { targetId: '399', start: '2026-01-01', stop: '2026-01-02' };
const contact = 'tests@example.test';
let testNow = Date.now();
beforeEach(() => { testNow += 31_000; vi.useFakeTimers({ now: testNow }); });
afterEach(() => { vi.useRealTimers(); });

describe('Horizons input', () => {
  it('allows explicit asteroid identifiers and defaults to barycentric vectors', () => {
    expect(horizonsInputSchema.parse({ ...input, targetId: '1;' })).toMatchObject({ center: '500@0', step: '1d' });
  });
  it.each([
    { targetId: "399';COMMAND='10" }, { start: '2026-02-30' }, { start: '2026-01-02' },
    { stop: '2028-01-01' }, { stop: '2026-06-01', step: '1h' }, { center: 'http://localhost' },
    { step: '1s' }, { surprise: 'parameter' },
  ])('rejects unsafe or excessively expensive input %j', (change) => {
    expect(horizonsInputSchema.safeParse({ ...input, ...change }).success).toBe(false);
  });
});

describe('Horizons normalization and caching', () => {
  it('normalizes vectors, preserves provenance and singleflights duplicate requests', async () => {
    vi.useFakeTimers();
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(fixture)));
    const provider = new HorizonsProvider({ fetch: upstream, contact });
    const [first, second] = await Promise.all([provider.getEphemeris(input), provider.getEphemeris(input)]);
    expect(first).toBe(second);
    expect(first.samples[0]).toMatchObject({ julianDateTdb: 2461041.5, position: { x: 120_000_000, y: -20_000_000, z: 300 } });
    expect(first).toMatchObject({ timeScale: 'TDB', referenceFrame: 'ICRF', referencePlane: 'FRAME', units: { position: 'km', velocity: 'km/s' } });
    expect(first.source).toMatchObject({ dataVersion: '1.3', provider: 'NASA/JPL Horizons API' });
    await provider.getEphemeris(input);
    expect(upstream).toHaveBeenCalledTimes(1);
    const url = new URL(String(upstream.mock.calls[0]![0]));
    expect(url.searchParams.get('COMMAND')).toBe("'399'");
    expect(url.searchParams.get('OUT_UNITS')).toBe("'KM-S'");
    expect(url.searchParams.get('STEP_SIZE')).toBe("'1 d'");
    expect(upstream.mock.calls[0]![1]).toMatchObject({ redirect: 'error', headers: { 'User-Agent': 'UniversalCosmos/0.1.0 (tests@example.test)' } });
  });

  it('serializes independent requests to respect JPL fair use', async () => {
    vi.useFakeTimers();
    let active = 0;
    let peak = 0;
    const upstream = vi.fn<typeof fetch>().mockImplementation(async () => {
      active++; peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return new Response(JSON.stringify(fixture));
    });
    const provider = new HorizonsProvider({ fetch: upstream, contact });
    await Promise.all([provider.getEphemeris(input), provider.getEphemeris({ ...input, targetId: '499' })]);
    expect(peak).toBe(1);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it('requires the operator contact required by JPL policy before any request', async () => {
    vi.useFakeTimers();
    const upstream = vi.fn<typeof fetch>();
    await expect(new HorizonsProvider({ fetch: upstream }).getEphemeris(input)).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' });
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rejects changed API versions instead of silently parsing a different contract', async () => {
    vi.useFakeTimers();
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ...fixture, signature: { version: '2.0', source: 'NASA/JPL Horizons API' } })));
    await expect(new HorizonsProvider({ fetch: upstream, contact }).getEphemeris(input)).rejects.toMatchObject({ code: 'PROVIDER_VERSION_CHANGED' });
  });

  it('handles provider-declared errors without exposing their raw contents', async () => {
    vi.useFakeTimers();
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ...fixture, error: 'Internal provider details' })));
    await expect(new HorizonsProvider({ fetch: upstream, contact }).getEphemeris(input)).rejects.toMatchObject({ code: 'EPHEMERIS_UNAVAILABLE', message: 'Horizons could not produce the requested ephemeris' });
  });

  it('rejects a valid-looking but incomplete time series', async () => {
    const partial = { ...fixture, result: fixture.result.replace(/2461042\.5[^\n]+\n/, '') };
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(partial)));
    await expect(new HorizonsProvider({ fetch: upstream, contact }).getEphemeris(input)).rejects.toMatchObject({ code: 'INVALID_PROVIDER_RESPONSE' });
  });

  it.each(['No matches found', '$$SOE\n$$EOE', '$$SOE\n1,date,1,2,3,4,5,NaN,\n$$EOE', '$$SOE\n1,date,,2,3,4,5,6,\n$$EOE'])('rejects malformed vector tables', (text) => {
    vi.useFakeTimers();
    expect(() => parseVectorTable(text)).toThrow();
  });
});
