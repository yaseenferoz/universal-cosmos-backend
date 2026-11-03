/** Real identity-only records, verified against the official Horizons manual.
 * These are not simulated measurements; physical/orbital values are intentionally
 * absent until imported from an attributed scientific source.
 */
export const solarSystemIdentities = [
  { name: 'Sun', slug: 'sun', objectType: 'STAR', horizonsId: '10', parentSlug: null },
  { name: 'Mercury', slug: 'mercury', objectType: 'PLANET', horizonsId: '199', parentSlug: 'sun' },
  { name: 'Venus', slug: 'venus', objectType: 'PLANET', horizonsId: '299', parentSlug: 'sun' },
  { name: 'Earth', slug: 'earth', objectType: 'PLANET', horizonsId: '399', parentSlug: 'sun' },
  { name: 'Mars', slug: 'mars', objectType: 'PLANET', horizonsId: '499', parentSlug: 'sun' },
  { name: 'Jupiter', slug: 'jupiter', objectType: 'PLANET', horizonsId: '599', parentSlug: 'sun' },
  { name: 'Saturn', slug: 'saturn', objectType: 'PLANET', horizonsId: '699', parentSlug: 'sun' },
  { name: 'Uranus', slug: 'uranus', objectType: 'PLANET', horizonsId: '799', parentSlug: 'sun' },
  { name: 'Neptune', slug: 'neptune', objectType: 'PLANET', horizonsId: '899', parentSlug: 'sun' },
  { name: 'Moon', slug: 'moon', objectType: 'MOON', horizonsId: '301', parentSlug: 'earth' },
] as const;

export const horizonsIdentitySource = {
  name: 'JPL Horizons',
  provider: 'NASA/JPL Solar System Dynamics',
  sourceUrl: 'https://ssd.jpl.nasa.gov/horizons/manual.html#select',
  license: null,
  attribution: 'NASA/JPL Solar System Dynamics, Horizons System. Planet-center identifiers; identity-only seed.',
  dataVersion: 'Horizons body identifiers, verified 2026-11-02',
} as const;
