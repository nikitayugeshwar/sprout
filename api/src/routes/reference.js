import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { referenceCurves, INDICATORS } from '../services/growth/index.js';
import { describeTables } from '../services/growth/tables.js';
import { MILESTONES, DOMAINS, CHECKPOINTS, SOURCE as MILESTONE_SOURCE } from '../services/milestones/catalog.js';
import { SCHEDULE, SOURCE as VACCINE_SOURCE, VISIT_ORDER } from '../services/vaccines/schedule.js';

export const referenceRouter = Router();

/**
 * Public reference data. None of this is user-specific, so it is cacheable —
 * the WHO tables have not changed since 2006.
 */
referenceRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'public, max-age=86400');
  next();
});

referenceRouter.get('/', (_req, res) => {
  res.json({
    indicators: Object.values(INDICATORS),
    growthTables: describeTables(),
    milestones: { checkpoints: CHECKPOINTS, domains: Object.values(DOMAINS), count: MILESTONES.length, source: MILESTONE_SOURCE },
    immunisation: { visits: VISIT_ORDER, doses: SCHEDULE.length, source: VACCINE_SOURCE },
  });
});

referenceRouter.get(
  '/growth/:indicator',
  validate({
    params: z.object({ indicator: z.enum(['wfa', 'lhfa', 'bfa', 'hcfa']) }),
    query: z.object({
      sex: z.enum(['male', 'female']),
      toMonths: z.coerce.number().min(1).max(61).optional(),
      zLines: z.string().optional(),
    }),
  }),
  (req, res) => {
    const { sex, toMonths, zLines } = req.valid.query;
    res.json(
      referenceCurves({
        indicator: req.params.indicator,
        sex,
        toDays: toMonths ? toMonths * 30.4375 : undefined,
        zLines: zLines ? zLines.split(',').map(Number).filter(Number.isFinite) : undefined,
      }),
    );
  },
);

referenceRouter.get('/milestones', (_req, res) => {
  res.json({ checkpoints: CHECKPOINTS, domains: Object.values(DOMAINS), milestones: MILESTONES, source: MILESTONE_SOURCE });
});

referenceRouter.get('/immunisation', (_req, res) => {
  res.json({ visits: VISIT_ORDER, schedule: SCHEDULE, source: VACCINE_SOURCE });
});
