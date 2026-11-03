import pino from 'pino';
export function createLogger(level = 'info') {
  return pino({ level, redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', 'databaseUrl', 'DATABASE_URL'] });
}
