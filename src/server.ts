import 'dotenv/config';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createLogger } from './config/logger.js';
import { createPrismaClient } from './database/client.js';
import { createObjectRepository } from './modules/objects/objects.repository.js';
import { ObjectService } from './modules/objects/objects.service.js';
import { createAssetRepository } from './modules/assets/assets.repository.js';
import { AssetService } from './modules/assets/assets.service.js';
import { createApiRouter } from './routes.js';
import { HorizonsProvider } from './integrations/nasa/horizons/index.js';
import { EphemerisService } from './modules/ephemeris/ephemeris.service.js';

const config = loadEnv();
const logger = createLogger(config.LOG_LEVEL);
const db = createPrismaClient(config.DATABASE_URL);
const objects = new ObjectService(createObjectRepository(db));
const ephemeris = new EphemerisService(objects, new HorizonsProvider({ contact: config.ASTRONOMY_CONTACT, timeoutMs: config.UPSTREAM_TIMEOUT_MS, cacheTtlMs: config.EPHEMERIS_CACHE_TTL_SECONDS * 1000 }));
const apiRouter = createApiRouter({ objects, assets: new AssetService(createAssetRepository(db)), ephemeris });
const app = createApp({ config, logger, apiRouter, readiness: async () => { await db.$queryRaw`SELECT 1`; } });
const server = app.listen(config.PORT, () => logger.info({ port: config.PORT }, 'API listening'));
let closing = false;
function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  logger.info({ signal }, 'Shutting down');
  const timeout = setTimeout(() => { logger.error('Graceful shutdown timed out'); process.exit(1); }, 10000);
  timeout.unref();
  server.close(() => {
    void db.$disconnect().then(() => { clearTimeout(timeout); process.exitCode = 0; }).catch(() => { logger.error('Database shutdown failed'); clearTimeout(timeout); process.exitCode = 1; });
  });
  server.closeIdleConnections();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
server.on('error', () => { logger.fatal('HTTP server failed to start'); void db.$disconnect(); process.exitCode = 1; });
