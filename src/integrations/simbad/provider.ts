import { z } from 'zod';
import { requestJson, type UpstreamRequestOptions } from '../http.js';
import { adqlLiteral, parseUpstream, tapRows } from '../../modules/catalogs/validation.js';
import { AppError } from '../../utils/errors.js';

export const simbadIdentifierSchema = z.string().trim().min(1).max(120).refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
const rowSchema = z.object({
  main_id: z.string(), otype: z.string(), ra: z.number().min(0).lt(360).nullable(),
  dec: z.number().min(-90).max(90).nullable(), coo_bibcode: z.string().nullable(), alias: z.string(),
});

// Endpoint, basic/ident tables and JSON metadata/data format verified against the
// official Harvard SIMBAD mirror's /capabilities and /tables on 2026-11-02.
export class SimbadProvider {
  constructor(private readonly options: UpstreamRequestOptions = {}) {}
  async identify(identifier: string) {
    const name = simbadIdentifierSchema.parse(identifier);
    const adql = `SELECT TOP 100 b.main_id,b.otype,b.ra,b.dec,b.coo_bibcode,a.id AS alias FROM basic AS b JOIN ident AS i ON b.oid=i.oidref JOIN ident AS a ON b.oid=a.oidref WHERE i.id=${adqlLiteral(name)} ORDER BY alias`;
    const url = new URL('https://simbad.cfa.harvard.edu/simbad/sim-tap/sync');
    url.search = new URLSearchParams({ request: 'doQuery', lang: 'adql', format: 'json', query: adql }).toString();
    const rows = parseUpstream(z.array(rowSchema).max(100), tapRows(await requestJson(url, this.options)));
    const first = rows[0];
    if (!first) return null;
    if (rows.some((row) => row.main_id !== first.main_id)) throw new AppError(502, 'UPSTREAM_INVALID_RESPONSE', 'SIMBAD returned ambiguous identifiers');
    return {
      mainIdentifier: first.main_id, objectType: first.otype, aliases: rows.map((row) => row.alias), aliasesMayBeTruncated: rows.length === 100,
      coordinates: { rightAscension: first.ra, declination: first.dec, angleUnit: 'deg', frame: 'ICRS', epoch: 'J2000', reference: first.coo_bibcode },
      source: { provider: 'CDS/SIMBAD', sourceUrl: 'https://simbad.cfa.harvard.edu/simbad/sim-tap/', attribution: 'SIMBAD database, operated at CDS, Strasbourg, France', retrievedAt: new Date().toISOString() },
    };
  }
}
