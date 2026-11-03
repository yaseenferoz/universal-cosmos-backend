import { z } from 'zod';
import { requestJson } from '../../http.js';
import type { EphemerisResult, VectorSample } from '../../types.js';
import { AppError } from '../../../utils/errors.js';
import { TtlCache } from '../../../utils/cache.js';
import { horizonsInputSchema, type HorizonsInput } from './horizons.schema.js';

const ENDPOINT = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const SUPPORTED_VERSION = '1.3';
const envelopeSchema = z.object({
  signature: z.object({ version: z.string(), source: z.string() }),
  result: z.string().optional(), error: z.string().optional(),
});

// The JPL fair-use policy permits one simultaneous request. This gate is shared
// across provider instances in the process. Deploy only one outbound JPL worker.
let tail: Promise<unknown> = Promise.resolve();
let queued = 0;
let cooldownUntil = 0;
function serialize<T>(work: () => Promise<T>): Promise<T> {
  if (queued >= 16) return Promise.reject(new AppError(503, 'PROVIDER_BUSY', 'Ephemeris request queue is full'));
  queued += 1;
  const result = tail.then(async () => {
    if (Date.now() < cooldownUntil) throw new AppError(503, 'PROVIDER_COOLDOWN', 'Ephemeris provider is temporarily cooling down');
    try { return await work(); }
    catch (error) { cooldownUntil = Date.now() + 30_000; throw error; }
  });
  tail = result.catch(() => undefined).finally(() => { queued -= 1; });
  return result;
}

function invalid(): never { throw new AppError(502, 'INVALID_PROVIDER_RESPONSE', 'Horizons returned an unexpected vector table'); }

/** The documented VEC_TABLE=2 / CSV_FORMAT=YES columns are JD, calendar, x,y,z,vx,vy,vz. */
export function parseVectorTable(result: string): VectorSample[] {
  const start = result.indexOf('$$SOE');
  const end = result.indexOf('$$EOE');
  if (start < 0 || end <= start) invalid();
  const lines = result.slice(start + 5, end).trim().split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0 || lines.length > 1000) invalid();
  let previous = -Infinity;
  return lines.map((line) => {
    const fields = line.split(',').map((field) => field.trim());
    if (fields.at(-1) === '') fields.pop();
    if (fields.length !== 8 || !fields[1]) invalid();
    const numeric = [fields[0], ...fields.slice(2)].map((field) => {
      if (!field || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[EeDd][+-]?\d+)?$/.test(field)) invalid();
      const value = Number(field.replace(/[dD]/, 'E'));
      if (!Number.isFinite(value)) invalid();
      return value;
    });
    const [jd, x, y, z, vx, vy, vz] = numeric as [number, number, number, number, number, number, number];
    if (jd <= previous) invalid();
    previous = jd;
    return { julianDateTdb: jd, calendarDateTdb: fields[1]!, position: { x, y, z }, velocity: { x: vx, y: vy, z: vz } };
  });
}

export interface HorizonsOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  cacheTtlMs?: number;
  contact?: string;
}

export class HorizonsProvider {
  private readonly cache: TtlCache<EphemerisResult>;
  constructor(private readonly options: HorizonsOptions = {}) {
    this.cache = new TtlCache(128, options.cacheTtlMs ?? 3_600_000);
  }

  async getEphemeris(raw: unknown): Promise<EphemerisResult> {
    const input = horizonsInputSchema.parse(raw);
    const contact = this.options.contact;
    if (!contact || !/^(?:[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+|mailto:[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+|https:\/\/[^\s<>]+)$/.test(contact)) {
      throw new AppError(503, 'PROVIDER_NOT_CONFIGURED', 'Configure ASTRONOMY_CONTACT before requesting Horizons data');
    }
    return this.cache.getOrLoad(JSON.stringify(input), () => serialize(() => this.load(input, contact)));
  }

  private async load(input: HorizonsInput, contact: string): Promise<EphemerisResult> {
    const url = new URL(ENDPOINT);
    url.searchParams.set('format', 'json');
    const parameters = {
      COMMAND: input.targetId, EPHEM_TYPE: 'VECTORS', OBJ_DATA: 'NO', MAKE_EPHEM: 'YES',
      CENTER: input.center, START_TIME: input.start, STOP_TIME: input.stop,
      STEP_SIZE: { '1h': '1 h', '6h': '6 h', '1d': '1 d' }[input.step],
      REF_SYSTEM: 'ICRF', REF_PLANE: 'FRAME', TIME_TYPE: 'TDB', OUT_UNITS: 'KM-S',
      VEC_TABLE: '2', VEC_CORR: 'NONE', CSV_FORMAT: 'YES', VEC_LABELS: 'YES', CAL_TYPE: 'GREGORIAN',
    };
    for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, `'${value}'`);
    const raw = await requestJson(url, {
      ...this.options, allowedHosts: ['ssd.jpl.nasa.gov'], maxBytes: 1_000_000,
      headers: { 'User-Agent': `UniversalCosmos/0.1.0 (${contact})` },
    });
    const parsed = envelopeSchema.safeParse(raw);
    if (!parsed.success) invalid();
    const payload = parsed.data;
    if (payload.signature.version !== SUPPORTED_VERSION) {
      throw new AppError(502, 'PROVIDER_VERSION_CHANGED', 'Horizons API version changed; adapter review is required');
    }
    if (payload.error !== undefined) throw new AppError(502, 'EPHEMERIS_UNAVAILABLE', 'Horizons could not produce the requested ephemeris');
    if (!payload.result) invalid();
    const samples = parseVectorTable(payload.result);
    // Reject partial/truncated tables rather than presenting them as a complete interval.
    // Gregorian calendar arithmetic is used here, not a UTC-to-TDB conversion:
    // input calendar labels were explicitly supplied to Horizons in TDB.
    const startJd = Date.parse(input.start) / 86_400_000 + 2_440_587.5;
    const spanDays = (Date.parse(input.stop) - Date.parse(input.start)) / 86_400_000;
    const stepDays = { '1h': 1 / 24, '6h': 1 / 4, '1d': 1 }[input.step];
    if (samples.length !== Math.floor(spanDays / stepDays) + 1 ||
        samples.some((sample, index) => Math.abs(sample.julianDateTdb - (startJd + index * stepDays)) > 1e-8)) invalid();
    return {
      targetId: input.targetId, center: input.center, start: input.start, stop: input.stop, step: input.step,
      timeScale: 'TDB', referenceFrame: 'ICRF', referencePlane: 'FRAME', correction: 'NONE',
      units: { position: 'km', velocity: 'km/s', epoch: 'Julian day (TDB)' }, samples,
      source: {
        provider: payload.signature.source, sourceUrl: url.toString(), dataVersion: payload.signature.version,
        retrievedAt: new Date().toISOString(), attribution: 'NASA/JPL Solar System Dynamics, Horizons',
      },
    };
  }
}
