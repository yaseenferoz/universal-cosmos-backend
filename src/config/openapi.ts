type Schema = Record<string, unknown>;
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const nullableString = { type: 'string', nullable: true };
const uuid = { type: 'string', format: 'uuid' };
const array = (items: Schema): Schema => ({ type: 'array', items });
const object = (properties: Record<string, Schema>, required: string[] = Object.keys(properties)): Schema => ({ type: 'object', properties, required });
const measurement = { ...object({ value: { type: 'number' }, unit: { type: 'string' }, uncertainty: { type: 'number', nullable: true } }), nullable: true };
const envelope = (data: Schema, paginated = false) => object({ success: { type: 'boolean', enum: [true] }, data, meta: object({ source: { type: 'string' }, timestamp: { type: 'string', format: 'date-time' }, ...(paginated ? { pagination: ref('Pagination') } : {}) }) });
const errorResponse = (description: string) => ({ description, content: { 'application/json': { schema: ref('Error') } } });
const responses = (data: Schema, paginated = false) => ({
  '200': { description: 'Success', content: { 'application/json': { schema: envelope(data, paginated) } } },
  '400': errorResponse('Invalid request parameters'), '403': errorResponse('Disallowed origin'),
  '404': errorResponse('Resource not found'), '429': errorResponse('Rate limit exceeded'), '500': errorResponse('Internal error'),
});
const query = (name: string, schema: Schema, required = false, description?: string) => ({ name, in: 'query', required, schema, ...(description ? { description } : {}) });
const pagination = [query('page', { type: 'integer', minimum: 1, maximum: 1000, default: 1 }), query('pageSize', { type: 'integer', minimum: 1, maximum: 100, default: 20 })];
const id = { name: 'id', in: 'path', required: true, schema: uuid };
const typeSchema = { type: 'string', enum: ['PLANET', 'MOON', 'STAR', 'GALAXY', 'NEBULA', 'EXOPLANET', 'SMALL_BODY'] };
const paths: Record<string, unknown> = {
  '/health': { get: { tags: ['Operations'], summary: 'Process liveness', responses: responses(object({ status: { type: 'string', enum: ['ok'] }, service: { type: 'string' } })) } },
  '/health/ready': { get: { tags: ['Operations'], summary: 'PostgreSQL readiness', responses: { ...responses(object({ status: { type: 'string', enum: ['ready'] } })), '503': errorResponse('Database unavailable') } } },
  '/objects': { get: { tags: ['Objects'], summary: 'List stored celestial objects', parameters: [...pagination, query('objectType', typeSchema), query('parentObjectId', uuid)], responses: responses(array(ref('ObjectSummary')), true) } },
  '/objects/{id}': { get: { tags: ['Objects'], summary: 'Get object measurements and provenance', description: 'IDs are UUIDs returned by list/search. Missing measurements are null. Related coordinate/orbit/source/asset collections are bounded to 100 records each.', parameters: [id], responses: responses(ref('ObjectDetail')) } },
  '/search': { get: { tags: ['Objects'], summary: 'Search stored names, slugs and source identifiers', parameters: [query('q', { type: 'string', minLength: 2, maxLength: 100 }, true, 'Case-insensitive literal substring, trimmed; no control characters.'), ...pagination, query('objectType', typeSchema)], responses: responses(array(ref('ObjectSummary')), true) } },
  '/systems/solar': { get: { tags: ['Objects'], summary: 'Get the stored Solar System hierarchy', description: 'Objects are linked by parentObjectId, rooted at the Sun. Bounded to 8 hierarchy levels and 1000 objects.', responses: responses(object({ name: { type: 'string' }, rootObjectId: uuid, objects: array(ref('ObjectSummary')) })) } },
  '/assets/{id}': { get: { tags: ['Assets'], summary: 'Get an attributed media record', description: 'Returns metadata and the source URL, not proxied media bytes or internal storage keys.', parameters: [id], responses: responses(ref('Asset')) } },
  '/ephemeris/{id}': { get: { tags: ['Ephemeris'], summary: 'Get cached NASA/JPL Horizons geometric state vectors', description: 'Uses the stored JPL identifier. Dates denote midnight TDB, not UTC. Maximum 366 days / 1000 samples. Set ASTRONOMY_CONTACT before use. Fetch a time window once and interpolate client-side.', parameters: [id, query('start', { type: 'string', format: 'date' }, true, 'Gregorian date 1600-01-01 through 2500-12-31, TDB.'), query('stop', { type: 'string', format: 'date' }, true), query('step', { type: 'string', enum: ['1h', '6h', '1d'], default: '1d' }), query('center', { type: 'string', enum: ['500@0', '500@10', '500@399'], default: '500@0' }, false, 'Solar System barycenter, Sun center, or Earth center.')], responses: { ...responses(ref('Ephemeris')), '422': errorResponse('Object has no Horizons mapping'), '502': errorResponse('Provider failed or returned incompatible data'), '503': errorResponse('Missing contact, bounded queue full, or provider cooling down'), '504': errorResponse('Provider timed out') } } },
};
for (const type of ['planets', 'moons', 'stars', 'galaxies', 'nebulae', 'exoplanets']) {
  paths[`/${type}`] = { get: { tags: ['Objects'], summary: `List stored ${type}`, parameters: pagination, responses: responses(array(ref('ObjectSummary')), true) } };
}

export const openApiDocument = {
  openapi: '3.0.3',
  info: { title: 'Universal Cosmos API', version: '0.1.0', description: 'Database-backed scientific catalogues and cached time-dependent ephemerides. All measurements carry explicit units and sources. No authentication required for read-only public endpoints.' },
  servers: [{ url: '/api/v1' }],
  tags: [{ name: 'Operations' }, { name: 'Objects' }, { name: 'Assets' }, { name: 'Ephemeris' }],
  paths,
  components: { schemas: {
    Error: object({ success: { type: 'boolean', enum: [false] }, error: object({ code: { type: 'string' }, message: { type: 'string' }, details: array(object({ path: { type: 'string' }, message: { type: 'string' } })) }, ['code', 'message']) }),
    Pagination: object({ page: { type: 'integer' }, pageSize: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' } }),
    Measurement: measurement,
    ObjectSummary: object({ id: uuid, name: { type: 'string' }, slug: { type: 'string' }, objectType: typeSchema, description: nullableString, parentObjectId: { ...uuid, nullable: true }, catalogue: { ...object({ name: { type: 'string' }, identifier: nullableString }), nullable: true } }),
    ObjectDetail: { allOf: [ref('ObjectSummary'), object({
      updatedAt: { type: 'string', format: 'date-time' },
      relatedRecords: object(Object.fromEntries(['orbitalElements', 'coordinates', 'sources', 'assets'].map(name => [name, object({ total: { type: 'integer' }, returned: { type: 'integer' } })]))),
      physicalProperties: { ...object({ mass: ref('Measurement'), radius: ref('Measurement'), diameter: ref('Measurement'), density: ref('Measurement'), temperature: ref('Measurement'), luminosity: ref('Measurement'), spectralClass: nullableString, photometry: object({ g: ref('Measurement'), bp: ref('Measurement'), rp: ref('Measurement') }), source: nullableString, uncertainties: { type: 'object', nullable: true, additionalProperties: true }, additionalProperties: { type: 'object', nullable: true, additionalProperties: true } }), nullable: true },
      orbitalElements: array(ref('OrbitalElements')), coordinates: array(ref('Coordinates')), sources: array(ref('Source')), assets: array(ref('AssetSummary')),
    })] },
    OrbitalElements: object({ semiMajorAxis: ref('Measurement'), eccentricity: ref('Measurement'), inclination: ref('Measurement'), longitudeAscendingNode: ref('Measurement'), argumentOfPeriapsis: ref('Measurement'), meanAnomaly: ref('Measurement'), period: ref('Measurement'), epoch: { ...object({ value: { type: 'number' }, format: { type: 'string' }, timeScale: nullableString }), nullable: true }, referenceFrame: nullableString, source: { type: 'string' }, uncertainties: { type: 'object', nullable: true, additionalProperties: true } }),
    Coordinates: object({ rightAscension: ref('Measurement'), declination: ref('Measurement'), positionUncertainty: object({ rightAscension: ref('Measurement'), declination: ref('Measurement') }), distance: ref('Measurement'), parallax: ref('Measurement'), properMotion: object({ raCosDec: ref('Measurement'), dec: ref('Measurement') }), radialVelocity: ref('Measurement'), epoch: { ...object({ value: { type: 'number' }, format: { type: 'string' } }), nullable: true }, coordinateFrame: { type: 'string' }, source: { type: 'string' }, uncertainties: { type: 'object', nullable: true, additionalProperties: true } }),
    Source: object({ name: { type: 'string' }, provider: { type: 'string' }, url: { type: 'string', format: 'uri' }, license: nullableString, attribution: { type: 'string' }, dataVersion: nullableString, externalIdentifier: { type: 'string' }, importedAt: { type: 'string', format: 'date-time' } }),
    AssetSummary: object({ id: uuid, assetType: { type: 'string', enum: ['IMAGE', 'VIDEO', 'AUDIO', 'MODEL', 'DOCUMENT'] }, title: { type: 'string' }, sourceUrl: { type: 'string', format: 'uri' }, attribution: { type: 'string' }, license: nullableString }),
    Asset: { allOf: [ref('AssetSummary'), object({ objectId: uuid, metadata: { type: 'object', nullable: true, additionalProperties: true } })] },
    Ephemeris: object({ objectId: uuid, targetId: { type: 'string' }, center: { type: 'string' }, start: { type: 'string', format: 'date' }, stop: { type: 'string', format: 'date' }, step: { type: 'string' }, timeScale: { type: 'string', enum: ['TDB'] }, referenceFrame: { type: 'string', enum: ['ICRF'] }, referencePlane: { type: 'string', enum: ['FRAME'] }, correction: { type: 'string', enum: ['NONE'] }, units: object({ position: { type: 'string', enum: ['km'] }, velocity: { type: 'string', enum: ['km/s'] }, epoch: { type: 'string', enum: ['Julian day (TDB)'] } }), samples: array(object({ julianDateTdb: { type: 'number' }, calendarDateTdb: { type: 'string' }, position: ref('Vector3'), velocity: ref('Vector3') })), source: object({ provider: { type: 'string' }, sourceUrl: { type: 'string', format: 'uri' }, dataVersion: nullableString, retrievedAt: { type: 'string', format: 'date-time' }, attribution: { type: 'string' } }) }),
    Vector3: object({ x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } }),
  } },
};
