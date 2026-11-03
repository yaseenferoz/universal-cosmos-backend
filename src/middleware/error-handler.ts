import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';

export const notFound: RequestHandler = (_req, _res, next) => next(new AppError(404, 'ROUTE_NOT_FOUND', 'Route not found'));

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, req, res, _next) => {
    if (res.headersSent) { _next(err); return; }
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: { path: string; message: string }[] | undefined;
    if (err instanceof AppError) { status = err.status; code = err.code; message = err.message; }
    else if (err instanceof ZodError) {
      status = 400; code = 'VALIDATION_ERROR'; message = 'Invalid request parameters';
      details = err.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message }));
    } else if (typeof err === 'object' && err !== null && 'type' in err) {
      if (err.type === 'entity.parse.failed') { status = 400; code = 'INVALID_JSON'; message = 'Request body must be valid JSON'; }
      if (err.type === 'entity.too.large') { status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body exceeds the size limit'; }
      if (err.type === 'charset.unsupported' || err.type === 'encoding.unsupported') { status = 415; code = 'UNSUPPORTED_ENCODING'; message = 'Request body encoding is not supported'; }
    }
    if (status >= 500) logger.error({ requestId: req.id, code, errorType: err instanceof Error ? err.name : 'UnknownError' }, 'Request failed');
    res.status(status).json({ success: false, error: { code, message, ...(details ? { details } : {}) } });
  };
}
