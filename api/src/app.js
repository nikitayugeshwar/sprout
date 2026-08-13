import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';

import { config } from './config/env.js';
import { logger } from './config/logger.js';
import { dbState } from './config/db.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { authRouter } from './routes/auth.js';
import { childrenRouter } from './routes/children.js';
import { referenceRouter } from './routes/reference.js';

export function createApp() {
  const app = express();

  // Render, Railway and friends terminate TLS at a proxy; without this,
  // rate-limit keys and `secure` cookies both see the wrong thing.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // Same-origin and server-to-server requests carry no Origin header.
        if (!origin || config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`Origin ${origin} is not allowed`));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  if (!config.isTest) {
    app.use(
      pinoHttp({
        logger,
        // Health checks fire constantly on a PaaS; logging them buries the
        // requests that actually matter.
        autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
      }),
    );
  }

  app.use(
    '/api/',
    rateLimit({
      windowMs: 60_000,
      limit: config.isProd ? 120 : 10_000,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: { code: 'rate_limited', message: 'Slow down a moment.' } },
    }),
  );

  const v1 = express.Router();
  v1.get('/health', (_req, res) => {
    const db = dbState();
    res.status(db === 'connected' ? 200 : 503).json({
      status: db === 'connected' ? 'ok' : 'degraded',
      db,
      uptimeSeconds: Math.round(process.uptime()),
      version: '1.0.0',
    });
  });

  v1.get('/meta', (_req, res) => {
    res.json({
      name: 'Sprout API',
      version: '1.0.0',
      description: 'Child growth, milestone and immunisation tracking built on the WHO Child Growth Standards.',
      features: { ai: config.aiEnabled },
      endpoints: {
        auth: ['POST /api/v1/auth/register', 'POST /api/v1/auth/login', 'POST /api/v1/auth/demo', 'POST /api/v1/auth/logout', 'GET /api/v1/auth/me'],
        children: [
          'GET /api/v1/children',
          'POST /api/v1/children',
          'GET /api/v1/children/:childId',
          'PATCH /api/v1/children/:childId',
          'DELETE /api/v1/children/:childId',
          'GET /api/v1/children/:childId/overview',
        ],
        growth: [
          'GET /api/v1/children/:childId/measurements',
          'POST /api/v1/children/:childId/measurements',
          'DELETE /api/v1/children/:childId/measurements/:measurementId',
          'GET /api/v1/children/:childId/growth/:indicator',
        ],
        milestones: ['GET /api/v1/children/:childId/milestones', 'PUT /api/v1/children/:childId/milestones/:milestoneKey'],
        immunisation: [
          'GET /api/v1/children/:childId/immunisation',
          'PUT /api/v1/children/:childId/immunisation/:vaccineKey',
          'DELETE /api/v1/children/:childId/immunisation/:vaccineKey',
        ],
        reference: ['GET /api/v1/reference', 'GET /api/v1/reference/growth/:indicator', 'GET /api/v1/reference/milestones', 'GET /api/v1/reference/immunisation'],
      },
      dataSources: [
        'WHO Child Growth Standards (2006) — expanded z-score tables, cdn.who.int',
        'CDC "Learn the Signs. Act Early." developmental milestones (2022 revision)',
        'IAP ACVIP recommended immunisation schedule, 0–6 years',
      ],
      disclaimer: 'Sprout is a record-keeping and awareness tool. It does not diagnose, and it does not replace your paediatrician.',
    });
  });

  v1.use('/auth', authRouter);
  v1.use('/children', childrenRouter);
  v1.use('/reference', referenceRouter);

  app.use('/api/v1', v1);
  app.get('/', (_req, res) => res.redirect('/api/v1/meta'));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
