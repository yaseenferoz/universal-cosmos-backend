import { z } from 'zod';
import { requestJson, type UpstreamRequestOptions } from '../../http.js';
import { optionalMeasurement as m, parseUpstream, tapRows } from '../../../modules/catalogs/validation.js';
import type { CatalogBatch, CatalogObject, CatalogSource } from '../../../modules/catalogs/types.js';
import { AppError } from '../../../utils/errors.js';

export const gaiaSource: CatalogSource = {
  name: 'Gaia DR3', provider: 'ESA/Gaia/DPAC', sourceUrl: 'https://gea.esac.esa.int/archive/',
  license: null, attribution: 'ESA Gaia mission, processed by the Gaia Data Processing and Analysis Consortium (DPAC). See https://gea.esac.esa.int/archive/documentation/credits.html', dataVersion: 'DR3',
};
export const gaiaBatchSchema = z.object({
  limit: z.number().int().min(1).max(500).default(100),
  maxMagnitude: z.number().finite().min(-5).max(15),
  centerRa: z.number().min(0).lt(360).default(0), centerDec: z.number().min(-90).max(90).default(0),
  radiusDeg: z.number().positive().max(5).default(1),
  afterSourceId: z.string().regex(/^(0|[1-9]\d{0,18})$/).refine((value) => /^(0|[1-9]\d{0,18})$/.test(value) && BigInt(value) <= 9223372036854775807n).default('0'),
}).strict();
const gaiaRow = z.object({
  designation: z.string().regex(/^Gaia DR3 [1-9]\d{0,18}$/).refine((value) => {
    const suffix = value.slice('Gaia DR3 '.length);
    return /^\d+$/.test(suffix) && BigInt(suffix) <= 9223372036854775807n;
  }), ra: z.number().min(0).lt(360), dec: z.number().min(-90).max(90),
  ref_epoch: z.number().finite(), ra_error: m, dec_error: m, parallax: m, parallax_error: m,
  pmra: m, pmdec: m, pmra_error: m, pmdec_error: m, radial_velocity: m, radial_velocity_error: m,
  phot_g_mean_mag: m, phot_bp_mean_mag: m, phot_rp_mean_mag: m,
  phot_g_mean_flux: m, phot_g_mean_flux_error: m, phot_bp_mean_flux: m, phot_bp_mean_flux_error: m,
  phot_rp_mean_flux: m, phot_rp_mean_flux_error: m,
});
export function normalizeGaiaRow(input: unknown): CatalogObject {
  const row = parseUpstream(gaiaRow, input);
  // designation carries the exact 64-bit source ID as text; JSON numbers would lose precision.
  const sourceId = row.designation.slice('Gaia DR3 '.length);
  return {
    name: row.designation, sourceCatalog: 'gaiadr3.gaia_source', sourceCatalogId: sourceId, objectType: 'STAR', source: gaiaSource,
    coordinates: {
      rightAscension: row.ra, declination: row.dec, angleUnit: 'deg', coordinateFrame: 'ICRS',
      epoch: row.ref_epoch, epochFormat: 'Julian year (TCB)', source: gaiaSource.name,
      rightAscensionError: row.ra_error, declinationError: row.dec_error, positionErrorUnit: 'mas',
      parallax: row.parallax, parallaxError: row.parallax_error, parallaxUnit: 'mas',
      properMotionRa: row.pmra, properMotionDec: row.pmdec, properMotionRaError: row.pmra_error,
      properMotionDecError: row.pmdec_error, properMotionUnit: 'mas/yr',
      radialVelocity: row.radial_velocity, radialVelocityError: row.radial_velocity_error, radialVelocityUnit: 'km/s',
      uncertaintyJson: { convention: '1 sigma; rightAscensionError and properMotionRa include cos(declination)', distanceInference: 'none' },
    },
    physical: {
      photometricG: row.phot_g_mean_mag, photometricBp: row.phot_bp_mean_mag, photometricRp: row.phot_rp_mean_mag,
      photometryUnit: 'mag', source: gaiaSource.name,
      propertiesJson: { photometricFluxes: {
        g: { value: row.phot_g_mean_flux, uncertainty: row.phot_g_mean_flux_error, unit: 'electron/s' },
        bp: { value: row.phot_bp_mean_flux, uncertainty: row.phot_bp_mean_flux_error, unit: 'electron/s' },
        rp: { value: row.phot_rp_mean_flux, uncertainty: row.phot_rp_mean_flux_error, unit: 'electron/s' },
      } },
    },
  };
}

export class GaiaProvider {
  constructor(private readonly options: UpstreamRequestOptions = {}) {}
  async getBatch(input: z.input<typeof gaiaBatchSchema>): Promise<CatalogBatch> {
    const query = gaiaBatchSchema.parse(input);
    const columns = Object.keys(gaiaRow.shape).join(',');
    const adql = `SELECT TOP ${query.limit} ${columns} FROM gaiadr3.gaia_source WHERE source_id > ${query.afterSourceId} AND phot_g_mean_mag <= ${query.maxMagnitude} AND parallax IS NOT NULL AND classprob_dsc_combmod_star >= 0.9 AND 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',${query.centerRa},${query.centerDec},${query.radiusDeg})) ORDER BY source_id`;
    const url = new URL('https://gea.esac.esa.int/tap-server/tap/sync');
    url.search = new URLSearchParams({ REQUEST: 'doQuery', LANG: 'ADQL', FORMAT: 'json', QUERY: adql }).toString();
    const rows = tapRows(await requestJson(url, this.options));
    if (rows.length > query.limit) throw new AppError(502, 'UPSTREAM_INVALID_RESPONSE', 'Gaia exceeded the batch limit');
    const objects = rows.map(normalizeGaiaRow);
    let previous = BigInt(query.afterSourceId);
    for (const object of objects) {
      if (BigInt(object.sourceCatalogId) <= previous) throw new AppError(502, 'UPSTREAM_INVALID_RESPONSE', 'Gaia returned unordered source identifiers');
      previous = BigInt(object.sourceCatalogId);
    }
    return { objects, nextCursor: objects.length === query.limit ? objects.at(-1)!.sourceCatalogId : null };
  }
}
