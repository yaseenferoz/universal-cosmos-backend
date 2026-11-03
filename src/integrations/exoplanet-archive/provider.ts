import { z } from 'zod';
import { requestJson, type UpstreamRequestOptions } from '../http.js';
import { adqlLiteral, optionalMeasurement, parseUpstream } from '../../modules/catalogs/validation.js';
import type { CatalogBatch, CatalogObject, CatalogSource, JsonValue } from '../../modules/catalogs/types.js';
import { AppError } from '../../utils/errors.js';

export const exoplanetSource: CatalogSource = {
  name: 'NASA Exoplanet Archive Planetary Systems', provider: 'NASA/IPAC',
  sourceUrl: 'https://exoplanetarchive.ipac.caltech.edu/', license: null,
  attribution: 'NASA Exoplanet Archive, operated by Caltech under contract with NASA, under the Exoplanet Exploration Program.',
  dataVersion: 'ps; default_flag=1',
};
export const exoplanetBatchSchema = z.object({ limit: z.number().int().min(1).max(500).default(100), afterName: z.string().trim().min(1).max(255).optional() }).strict();
const fields = ['pl_bmassj', 'pl_radj', 'pl_eqt', 'pl_orbsmax', 'pl_orbeccen', 'pl_orbincl', 'pl_orbper', 'pl_orblper'] as const;
const rowSchema = z.looseObject({
  pl_name: z.string().min(1).max(255), hostname: z.string().min(1), default_flag: z.literal(1),
  soltype: z.enum(['Published Confirmed', 'Confirmed']),
  pl_bmassprov: z.string().nullable(), pl_refname: z.string().nullable(), rowupdate: z.string().nullable(),
  ra: z.number().min(0).lt(360).nullable(), dec: z.number().min(-90).max(90).nullable(),
  sy_dist: optionalMeasurement, sy_disterr1: optionalMeasurement, sy_disterr2: optionalMeasurement,
});

export function normalizeExoplanetRow(input: unknown): CatalogObject {
  const row = parseUpstream(rowSchema, input);
  const value = (key: string) => parseUpstream(optionalMeasurement, row[key]);
  const uncertainty: Record<string, JsonValue> = {};
  for (const field of fields) {
    // err2 is the archive's signed lower error, not a second upper error.
    uncertainty[field] = { upper: value(`${field}err1`), lower: value(`${field}err2`), limitFlag: value(`${field}lim`) };
  }
  const mass = value('pl_bmassj');
  return {
    name: row.pl_name, objectType: 'EXOPLANET', sourceCatalog: 'NASA_EXOPLANET_ARCHIVE.ps', sourceCatalogId: row.pl_name, source: exoplanetSource,
    coordinates: {
      rightAscension: row.ra, declination: row.dec, angleUnit: 'deg', coordinateFrame: 'ICRS',
      epoch: null, epochFormat: 'Julian year', source: exoplanetSource.name,
      distance: row.sy_dist, distanceUnit: 'pc',
      uncertaintyJson: { distance: { upper: row.sy_disterr1, lower: row.sy_disterr2, unit: 'pc' }, note: 'Source RA/Dec are J2000 equatorial coordinates; measurement epoch is not supplied.' },
    },
    physical: {
      mass: row.pl_bmassprov === 'Mass' ? mass : null, massUnit: 'M_jup', radius: value('pl_radj'), radiusUnit: 'R_jup',
      temperature: value('pl_eqt'), temperatureUnit: 'K', source: exoplanetSource.name,
      propertiesJson: {
        hostname: row.hostname, sourceTable: 'ps', solutionType: row.soltype, sourceRowUpdated: row.rowupdate,
        parameterReference: row.pl_refname, temperatureKind: 'equilibrium temperature; may be effective temperature for directly imaged planets',
        bestMassEstimate: { value: mass, unit: 'M_jup', provenance: row.pl_bmassprov, uncertainty: uncertainty.pl_bmassj! },
      },
      uncertaintyJson: { mass: row.pl_bmassprov === 'Mass' ? uncertainty.pl_bmassj! : null, radius: uncertainty.pl_radj!, temperature: uncertainty.pl_eqt!, convention: 'Archive signed err1/err2 and limit flags; units match each measurement' },
    },
    orbital: {
      semiMajorAxis: value('pl_orbsmax'), semiMajorAxisUnit: 'au', eccentricity: value('pl_orbeccen'),
      inclination: value('pl_orbincl'), argumentOfPeriapsis: value('pl_orblper'), angleUnit: 'deg',
      orbitalPeriod: value('pl_orbper'), orbitalPeriodUnit: 'day', source: exoplanetSource.name,
      uncertaintyJson: { semiMajorAxis: uncertainty.pl_orbsmax!, eccentricity: uncertainty.pl_orbeccen!, inclination: uncertainty.pl_orbincl!, argumentOfPeriapsis: uncertainty.pl_orblper!, orbitalPeriod: uncertainty.pl_orbper!, note: 'Published parameters; no osculating epoch/reference frame is asserted. Semi-major axis may be projected separation for imaging/microlensing. Argument of periapsis is reported as published: host-reflex and planetary conventions may differ by 180 degrees.' },
    },
  };
}

export class ExoplanetArchiveProvider {
  constructor(private readonly options: UpstreamRequestOptions = {}) {}
  async getBatch(input: z.input<typeof exoplanetBatchSchema> = {}): Promise<CatalogBatch> {
    const query = exoplanetBatchSchema.parse(input);
    const columns = [...Object.keys(rowSchema.shape), ...fields.flatMap((key) => [key, `${key}err1`, `${key}err2`, `${key}lim`])];
    // This TAP service applies TOP before ordering. MAXREC caps the sorted result,
    // which is essential to avoid skipping names between keyset batches.
    const adql = `SELECT ${columns.join(',')} FROM ps WHERE default_flag=1 AND soltype IN ('Published Confirmed','Confirmed')${query.afterName ? ` AND pl_name > ${adqlLiteral(query.afterName)}` : ''} ORDER BY pl_name`;
    const url = new URL('https://exoplanetarchive.ipac.caltech.edu/TAP/sync');
    url.search = new URLSearchParams({ query: adql, format: 'json', MAXREC: String(query.limit) }).toString();
    const rows = parseUpstream(z.array(z.unknown()).max(query.limit), await requestJson(url, this.options));
    const objects = rows.map(normalizeExoplanetRow);
    if (new Set(objects.map((object) => object.sourceCatalogId)).size !== objects.length || objects.some((object) => object.sourceCatalogId === query.afterName)) throw new AppError(502, 'UPSTREAM_INVALID_RESPONSE', 'Exoplanet batch contains duplicate identifiers or did not advance');
    return { objects, nextCursor: objects.length === query.limit ? objects.at(-1)!.sourceCatalogId : null };
  }
}
