import { randomUUID } from 'node:crypto';
import express, { type Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import type { Environment } from './config/env.js';
import { createLogger } from './config/logger.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { AppError } from './utils/errors.js';
import { success } from './utils/response.js';
import swaggerUi from 'swagger-ui-express';
import { openApiDocument } from './config/openapi.js';

export interface AppOptions {
  config: Environment;
  logger?: Logger;
  apiRouter?: Router;
  readiness?: () => Promise<void>;
}
export function createApp({ config, logger = createLogger(config.LOG_LEVEL), apiRouter, readiness }: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.set('trust proxy', config.TRUST_PROXY_HOPS);
  app.use(pinoHttp({ logger, genReqId: (_req, res) => { const id = randomUUID(); res.setHeader('X-Request-ID', id); return id; }, serializers: { req: req => ({ id: req.id, method: req.method, url: String(req.url).split('?')[0] }), res: res => ({ statusCode: res.statusCode }) } }));
  app.use(helmet());
  app.use(cors({ origin(origin, callback) { if (!origin || origin === config.FRONTEND_ORIGIN) callback(null, true); else callback(new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Origin is not allowed')); }, methods: ['GET', 'HEAD', 'OPTIONS'] }));
  app.use(rateLimit({ windowMs: 60_000, limit: config.RATE_LIMIT_MAX, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, res) => { res.status(429).json({ success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests; retry later' } }); } }));
  app.use(express.json({ limit: '32kb' }));
  app.get('/api/v1/health', (_req, res) => res.json(success({ status: 'ok', service: 'universal-cosmos-backend' })));
  app.get('/api/v1/health/ready', async (_req, res) => {
    if (!readiness) throw new AppError(503, 'DATABASE_UNAVAILABLE', 'Database readiness is not configured');
    try { await readiness(); } catch { throw new AppError(503, 'DATABASE_UNAVAILABLE', 'Database is unavailable'); }
    res.json(success({ status: 'ready' }));
  });
  if (apiRouter) app.use('/api/v1', apiRouter);
  app.get('/api/v1/openapi.json', (_req, res) => res.json(openApiDocument));
  app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, { swaggerOptions: { validatorUrl: null }, customSiteTitle: 'Universal Cosmos API' }));
  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
