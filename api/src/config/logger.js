import pino from 'pino';
import { config } from './env.js';

export const logger = pino({
  level: config.isTest ? 'silent' : config.LOG_LEVEL,
  // Pretty output is a development nicety; production ships newline-delimited
  // JSON so a log aggregator can index it.
  transport: config.isProd
    ? undefined
    : { target: 'pino/file', options: { destination: 1 } },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password', 'res.headers["set-cookie"]'],
    censor: '[redacted]',
  },
});
