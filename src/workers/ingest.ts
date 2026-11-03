import 'dotenv/config';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { createPrismaClient } from '../database/client.js';
import { loadEnv } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import { GaiaProvider } from '../integrations/esa/gaia/provider.js';
import { ExoplanetArchiveProvider } from '../integrations/exoplanet-archive/provider.js';
import { NasaImagesProvider } from '../integrations/nasa/images/provider.js';
import { SimbadProvider } from '../integrations/simbad/provider.js';
import { PrismaCatalogRepository } from '../modules/catalogs/repository.js';
import { CatalogIngestionService } from '../modules/catalogs/service.js';

const logger = createLogger();
const help = `Usage:
  npm run ingest -- gaia --max-magnitude 8 --limit 500 [--ra 0 --dec 0 --radius 1] [--cursor SOURCE_ID]
  npm run ingest -- exoplanets --limit 500 [--cursor PLANET_NAME]
  npm run ingest -- nasa-media --object-id UUID --query Saturn [--limit 25]
  npm run ingest -- simbad --identifier "M 31"
Commands run one bounded job and exit. Schedule externally; avoid overlapping jobs.
Gaia requires an explicit magnitude selection. No whole-catalogue download is offered.`;

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    limit: { type: 'string', default: '100' }, cursor: { type: 'string' }, 'max-magnitude': { type: 'string' },
    'object-id': { type: 'string' }, query: { type: 'string' }, identifier: { type: 'string' }, help: { type: 'boolean' },
    ra: { type: 'string', default: '0' }, dec: { type: 'string', default: '0' }, radius: { type: 'string', default: '1' },
  } });
  if (values.help || positionals.length === 0) { process.stdout.write(`${help}\n`); return; }
  const command = z.enum(['gaia', 'exoplanets', 'nasa-media', 'simbad']).parse(positionals[0]);
  if (positionals.length !== 1) throw new Error('Exactly one ingestion command is required');
  const maxRows = z.coerce.number().int().min(1).max(10000).parse(values.limit);
  const env = loadEnv();
  const options = { timeoutMs: env.UPSTREAM_TIMEOUT_MS };
  if (command === 'simbad') {
    const identifier = z.string().min(1).parse(values.identifier);
    logger.info({ result: await new SimbadProvider(options).identify(identifier) }, 'SIMBAD identity lookup');
    return;
  }
  const prisma = createPrismaClient(env.DATABASE_URL);
  try {
    const repository = new PrismaCatalogRepository(prisma);
    const service = new CatalogIngestionService(repository);
    if (command === 'nasa-media') {
      const objectId = z.uuid().parse(values['object-id']);
      const query = z.string().min(2).parse(values.query);
      const limit = z.number().max(100).parse(maxRows);
      const result = await new NasaImagesProvider(options).search({ q: query, pageSize: limit });
      await repository.saveMedia(objectId, result.items);
      logger.info({ imported: result.items.length, objectId }, 'NASA media metadata imported');
      return;
    }
    const result = command === 'gaia'
      ? await service.ingest((limit, cursor) => new GaiaProvider(options).getBatch({ limit, maxMagnitude: z.coerce.number().parse(values['max-magnitude']), centerRa: Number(values.ra), centerDec: Number(values.dec), radiusDeg: Number(values.radius), afterSourceId: cursor }), { maxRows, cursor: values.cursor })
      : await service.ingest((limit, cursor) => new ExoplanetArchiveProvider(options).getBatch({ limit, afterName: cursor }), { maxRows, cursor: values.cursor });
    logger.info({ provider: command, ...result }, 'Catalogue ingestion complete');
  } finally { await prisma.$disconnect(); }
}

main().catch((error: unknown) => {
  // Driver failures can include connection details, so do not log raw errors.
  logger.error({ code: error instanceof z.ZodError ? 'INVALID_ARGUMENTS' : 'INGESTION_FAILED' }, 'Ingestion failed; verify arguments, database connectivity and provider availability');
  process.exitCode = 1;
});
