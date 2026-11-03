import { describe, expect, it, vi } from 'vitest';
import { GaiaProvider, normalizeGaiaRow } from '../src/integrations/esa/gaia/provider.js';
import { ExoplanetArchiveProvider, normalizeExoplanetRow } from '../src/integrations/exoplanet-archive/provider.js';
import { NasaImagesProvider } from '../src/integrations/nasa/images/provider.js';
import { SimbadProvider } from '../src/integrations/simbad/provider.js';
import { tapRows } from '../src/modules/catalogs/validation.js';

// Synthetic fixtures deliberately do not claim to be scientific observations.
const gaiaFixture = { designation: 'Gaia DR3 999999999999999999', ra: 12, dec: -3, ref_epoch: 2016,
  parallax: -0.5, parallax_error: 0.1, pmra: 2, pmdec: -1, radial_velocity: null,
  phot_g_mean_mag: 7, phot_g_mean_flux: 20, phot_g_mean_flux_error: 0.3 };
const exoplanetFixture = { pl_name: 'Synthetic Planet b', hostname: 'Synthetic Star', default_flag: 1,
  soltype: 'Published Confirmed', pl_bmassprov: 'Msini', pl_refname: null, rowupdate: '2026-01-01',
  ra: 12, dec: 34, sy_dist: 20, pl_bmassj: 1.2, pl_bmassjerr1: 0.2, pl_bmassjerr2: -0.1,
  pl_radj: 1, pl_eqt: 800, pl_orbsmax: 0.2, pl_orbeccen: 0.1, pl_orbincl: 60, pl_orbper: 10,
  pl_orblper: 40, pl_radjlim: 1 };
function mockJson(value: unknown) { return vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })); }
function tap(...rows: Record<string, unknown>[]) {
  const names = Object.keys(rows[0] ?? {});
  return { metadata: names.map((name) => ({ name })), data: rows.map((row) => names.map((name) => row[name])) };
}

describe('Gaia catalogue provider', () => {
  it('keeps exact 64-bit identifiers, signed parallax, uncertainties and epoch without inventing distances', () => {
    const normalized = normalizeGaiaRow(gaiaFixture);
    expect(normalized.sourceCatalogId).toBe('999999999999999999');
    expect(normalized.coordinates).toMatchObject({ parallax: -0.5, parallaxUnit: 'mas', parallaxError: 0.1, epoch: 2016, epochFormat: 'Julian year (TCB)', radialVelocity: null });
    expect(normalized.coordinates.distance).toBeUndefined();
    expect(normalized.physical.propertiesJson).toMatchObject({ photometricFluxes: { g: { value: 20, uncertainty: 0.3, unit: 'electron/s' } } });
  });
  it('requests a bounded filtered keyset batch and returns its exact cursor', async () => {
    const fetch = mockJson(tap(gaiaFixture));
    const batch = await new GaiaProvider({ fetch }).getBatch({ limit: 1, maxMagnitude: 8 });
    const url = new URL(String(fetch.mock.calls[0]![0]));
    expect(url.searchParams.get('QUERY')).toContain('TOP 1');
    expect(url.searchParams.get('QUERY')).toContain('phot_g_mean_mag <= 8');
    expect(url.searchParams.get('QUERY')).toContain("CIRCLE('ICRS',0,0,1)");
    expect(url.searchParams.get('QUERY')).toContain('classprob_dsc_combmod_star >= 0.9');
    expect(url.searchParams.get('QUERY')).toContain('ORDER BY source_id');
    expect(batch.nextCursor).toBe('999999999999999999');
  });
  it('rejects unbounded and injected input before performing I/O', async () => {
    const fetch = mockJson({});
    const provider = new GaiaProvider({ fetch });
    await expect(provider.getBatch({ limit: 501, maxMagnitude: 8 })).rejects.toThrow();
    await expect(provider.getBatch({ maxMagnitude: 8, afterSourceId: '0 OR 1=1' })).rejects.toMatchObject({ name: 'ZodError' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('treats malformed upstream measurements as gateway failures', () => {
    expect(() => normalizeGaiaRow({ ...gaiaFixture, parallax: 'not a number' })).toThrow(expect.objectContaining({ code: 'UPSTREAM_INVALID_RESPONSE' }));
  });
});

describe('confirmed exoplanet provider', () => {
  it('preserves units, asymmetric errors and limit flags; does not label minimum mass as true mass', () => {
    const row = normalizeExoplanetRow(exoplanetFixture);
    expect(row.physical).toMatchObject({ mass: null, massUnit: 'M_jup', radius: 1, radiusUnit: 'R_jup', temperatureUnit: 'K' });
    expect(row.physical.propertiesJson).toMatchObject({ bestMassEstimate: { value: 1.2, provenance: 'Msini', uncertainty: { upper: 0.2, lower: -0.1 } }, sourceTable: 'ps' });
    expect(row.physical.uncertaintyJson).toMatchObject({ mass: null, radius: { limitFlag: 1 } });
    expect(row.orbital).toMatchObject({ semiMajorAxisUnit: 'au', orbitalPeriodUnit: 'day', angleUnit: 'deg' });
  });
  it('selects confirmed default solutions, safely escapes the cursor, and preserves provenance', async () => {
    const fetch = mockJson([exoplanetFixture]);
    const batch = await new ExoplanetArchiveProvider({ fetch }).getBatch({ limit: 1, afterName: "O'Brien b" });
    const query = new URL(String(fetch.mock.calls[0]![0])).searchParams.get('query');
    expect(query).toContain('default_flag=1');
    expect(query).toContain("soltype IN ('Published Confirmed','Confirmed')");
    expect(query).toContain("pl_name > 'O''Brien b'");
    expect(query).not.toContain('TOP');
    expect(new URL(String(fetch.mock.calls[0]![0])).searchParams.get('MAXREC')).toBe('1');
    expect(batch.objects[0]?.source.provider).toBe('NASA/IPAC');
  });
  it('rejects a candidate response instead of importing it as confirmed', () => {
    expect(() => normalizeExoplanetRow({ ...exoplanetFixture, soltype: 'Candidate' })).toThrow();
    expect(() => normalizeExoplanetRow({ ...exoplanetFixture, soltype: 'Unconfirmed' })).toThrow();
  });
});

describe('NASA media provider', () => {
  it('preserves source/title/credit, qualifies licensing, and discards unsafe preview URLs', async () => {
    const fetch = mockJson({ collection: { metadata: { total_hits: 1 }, items: [{ data: [{ nasa_id: 'test-id', title: 'Synthetic media', media_type: 'image', center: 'JPL', photographer: 'Test Author' }], links: [{ href: 'http://127.0.0.1/private', rel: 'preview' }] }] } });
    const result = await new NasaImagesProvider({ fetch }).search({ q: 'Saturn' });
    expect(result.items[0]).toMatchObject({ title: 'Synthetic media', sourceUrl: 'https://images.nasa.gov/details/test-id', attribution: 'NASA/JPL; Test Author', previewUrl: null });
    expect(result.items[0]?.license).toContain('third-party');
  });
  it('rejects malformed collection envelopes', async () => {
    await expect(new NasaImagesProvider({ fetch: mockJson({ reason: 'upstream error' }) }).search({ q: 'Saturn' })).rejects.toMatchObject({ code: 'UPSTREAM_INVALID_RESPONSE' });
  });
});

describe('SIMBAD identification', () => {
  it('normalizes verified TAP columns and keeps exact aliases and source reference', async () => {
    const fetch = mockJson(tap({ main_id: 'Synthetic star', otype: '*', ra: 12, dec: 34, coo_bibcode: 'TEST-ONLY', alias: 'HD 123' }));
    const result = await new SimbadProvider({ fetch }).identify("O'Brien");
    expect(result).toMatchObject({ mainIdentifier: 'Synthetic star', aliases: ['HD 123'], coordinates: { angleUnit: 'deg', frame: 'ICRS', epoch: 'J2000', reference: 'TEST-ONLY' } });
    expect(new URL(String(fetch.mock.calls[0]![0])).searchParams.get('query')).toContain("i.id='O''Brien'");
  });
  it('returns null for an unmatched identifier', async () => {
    expect(await new SimbadProvider({ fetch: mockJson({ metadata: [], data: [] }) }).identify('No-such-fixture')).toBeNull();
  });
  it('rejects inconsistent TAP row lengths and duplicate column names', () => {
    expect(() => tapRows({ metadata: [{ name: 'ra' }], data: [[1,2]] })).toThrow();
    expect(() => tapRows({ metadata: [{ name: 'ra' },{ name: 'RA' }], data: [[1,2]] })).toThrow();
  });
});
