import { Router } from 'express';
import { z } from 'zod';
import { Child, Measurement, MilestoneRecord, VaccineRecord } from '../models/index.js';
import { requireAuth, loadChild } from '../middleware/auth.js';
import { validate, objectId, pastDate } from '../middleware/validate.js';
import { notFound, badRequest } from '../middleware/error.js';
import { assess, series, describeAge, ageInDays, calendarAge, INDICATORS, referenceCurves } from '../services/growth/index.js';
import { MILESTONES, DOMAINS, CHECKPOINTS, MILESTONE_BY_KEY, graceMonths, SOURCE as MILESTONE_SOURCE } from '../services/milestones/catalog.js';
import { buildImmunisationPlan, SCHEDULE_BY_KEY } from '../services/vaccines/schedule.js';
import { buildInsights } from '../services/insights/engine.js';

export const childrenRouter = Router();

childrenRouter.use(requireAuth);

const childBody = z.object({
  name: z.string().trim().min(1, 'is required').max(60),
  sex: z.enum(['male', 'female'], { message: 'must be male or female' }),
  dob: pastDate,
  birthWeightKg: z.coerce.number().min(0.3).max(8).optional(),
  birthLengthCm: z.coerce.number().min(20).max(70).optional(),
  notes: z.string().max(2000).optional(),
});

const childParams = z.object({ childId: objectId });

/** Adds the derived fields every client needs but nobody should have to recompute. */
function decorate(child, now = new Date()) {
  const { months } = calendarAge(child.dob, now);
  return {
    ...child.toJSON(),
    ageDays: ageInDays(child.dob, now),
    ageMonths: months,
    ageLabel: describeAge(child.dob, now),
    /** WHO standards stop at 1856 days; past that we say so rather than guess. */
    withinGrowthStandards: ageInDays(child.dob, now) <= 1856,
  };
}

childrenRouter.get('/', async (req, res) => {
  const children = await Child.find({ userId: req.user.id }).sort({ dob: -1 });
  res.json({ children: children.map((c) => decorate(c)) });
});

childrenRouter.post('/', validate({ body: childBody }), async (req, res) => {
  const child = await Child.create({ ...req.body, userId: req.user.id });
  res.status(201).json({ child: decorate(child) });
});

childrenRouter.get('/:childId', validate({ params: childParams }), loadChild, async (req, res) => {
  res.json({ child: decorate(req.child) });
});

childrenRouter.patch(
  '/:childId',
  validate({ params: childParams, body: childBody.partial() }),
  loadChild,
  async (req, res) => {
    Object.assign(req.child, req.body);
    await req.child.save();
    res.json({ child: decorate(req.child) });
  },
);

childrenRouter.delete('/:childId', validate({ params: childParams }), loadChild, async (req, res) => {
  const childId = req.child._id;
  // Remove the dependent records too — orphaned measurements would quietly
  // reappear if an id were ever reused, and they are useless on their own.
  await Promise.all([
    Measurement.deleteMany({ childId }),
    MilestoneRecord.deleteMany({ childId }),
    VaccineRecord.deleteMany({ childId }),
    req.child.deleteOne(),
  ]);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * Overview — one round trip for the whole dashboard.
 * ------------------------------------------------------------------ */

async function loadAll(childId) {
  const [measurements, milestoneRecords, vaccineRecords] = await Promise.all([
    Measurement.find({ childId }).sort({ takenAt: 1 }),
    MilestoneRecord.find({ childId }),
    VaccineRecord.find({ childId }),
  ]);
  return { measurements, milestoneRecords, vaccineRecords };
}

childrenRouter.get('/:childId/overview', validate({ params: childParams }), loadChild, async (req, res) => {
  const child = req.child;
  const now = new Date();
  const { measurements, milestoneRecords, vaccineRecords } = await loadAll(child._id);

  const latest = measurements[measurements.length - 1] ?? null;
  const latestAssessment = latest ? assess({ sex: child.sex, dob: child.dob, measurement: latest }) : null;

  const immunisation = buildImmunisationPlan({ dob: child.dob, records: vaccineRecords, now });

  const achieved = new Set(milestoneRecords.filter((r) => r.status === 'achieved').map((r) => r.milestoneKey));
  const ageMonths = calendarAge(child.dob, now).months;
  const expected = MILESTONES.filter((m) => m.months <= ageMonths);
  const overdue = MILESTONES.filter((m) => ageMonths >= m.months + graceMonths(m.months) && !achieved.has(m.key));

  res.json({
    child: decorate(child, now),
    insights: buildInsights({ child, measurements, milestoneRecords, vaccineRecords, now }),
    growth: {
      latest: latestAssessment,
      takenAt: latest?.takenAt ?? null,
      measurementCount: measurements.length,
      trends: Object.fromEntries(
        Object.keys(INDICATORS).map((indicator) => {
          const pts = series({ sex: child.sex, dob: child.dob, measurements, indicator });
          return [
            indicator,
            {
              points: pts.length,
              latestZ: pts.at(-1)?.z ?? null,
              drift: pts.length >= 2 ? Math.round((pts.at(-1).z - pts[0].z) * 100) / 100 : null,
            },
          ];
        }),
      ),
    },
    milestones: {
      // Counted within the "due so far" set, not across the whole catalogue —
      // a parent who ticks ahead would otherwise see "47 / 36 due so far".
      achieved: expected.filter((m) => achieved.has(m.key)).length,
      achievedTotal: achieved.size,
      expected: expected.length,
      overdue: overdue.length,
      nextCheckpoint: CHECKPOINTS.find((c) => c > ageMonths) ?? null,
      byDomain: Object.values(DOMAINS).map((d) => {
        const forDomain = expected.filter((m) => m.domain === d.key);
        return {
          ...d,
          expected: forDomain.length,
          achieved: forDomain.filter((m) => achieved.has(m.key)).length,
        };
      }),
    },
    immunisation: {
      coverage: immunisation.coverage,
      counts: immunisation.counts,
      nextDue: immunisation.nextDue,
      overdue: immunisation.doses.filter((d) => d.status === 'overdue' || d.status === 'missed').slice(0, 5),
    },
  });
});

/* ------------------------------------------------------------------ *
 * Measurements
 * ------------------------------------------------------------------ */

const measurementBody = z
  .object({
    takenAt: pastDate.default(() => new Date()),
    weightKg: z.coerce.number().min(0.3).max(60).optional(),
    heightCm: z.coerce.number().min(20).max(160).optional(),
    headCircumferenceCm: z.coerce.number().min(20).max(65).optional(),
    source: z.enum(['parent', 'clinic']).default('parent'),
    note: z.string().max(500).optional(),
  })
  .refine(
    (v) => v.weightKg != null || v.heightCm != null || v.headCircumferenceCm != null,
    { message: 'Record at least one of weight, height or head circumference' },
  );

childrenRouter.get('/:childId/measurements', validate({ params: childParams }), loadChild, async (req, res) => {
  const measurements = await Measurement.find({ childId: req.child._id }).sort({ takenAt: -1 });
  res.json({
    measurements: measurements.map((m) => ({
      ...m.toJSON(),
      ...assess({ sex: req.child.sex, dob: req.child.dob, measurement: m }),
    })),
  });
});

childrenRouter.post(
  '/:childId/measurements',
  validate({ params: childParams, body: measurementBody }),
  loadChild,
  async (req, res) => {
    if (new Date(req.body.takenAt) < new Date(req.child.dob)) {
      throw badRequest('A measurement cannot predate the child’s date of birth');
    }

    const measurement = await Measurement.create({
      ...req.body,
      childId: req.child._id,
      userId: req.user.id,
    });

    res.status(201).json({
      measurement: {
        ...measurement.toJSON(),
        ...assess({ sex: req.child.sex, dob: req.child.dob, measurement }),
      },
    });
  },
);

childrenRouter.delete(
  '/:childId/measurements/:measurementId',
  validate({ params: childParams.extend({ measurementId: objectId }) }),
  loadChild,
  async (req, res) => {
    const deleted = await Measurement.findOneAndDelete({ _id: req.params.measurementId, childId: req.child._id });
    if (!deleted) throw notFound('No such measurement');
    res.json({ ok: true });
  },
);

/* ------------------------------------------------------------------ *
 * Growth charts
 * ------------------------------------------------------------------ */

childrenRouter.get(
  '/:childId/growth/:indicator',
  validate({
    params: childParams.extend({ indicator: z.enum(['wfa', 'lhfa', 'bfa', 'hcfa']) }),
    query: z.object({ zLines: z.string().optional() }),
  }),
  loadChild,
  async (req, res) => {
    const { indicator } = req.params;
    const child = req.child;
    const measurements = await Measurement.find({ childId: child._id }).sort({ takenAt: 1 });

    const points = series({ sex: child.sex, dob: child.dob, measurements, indicator });

    // Show the reference curves a little beyond the child's current age so the
    // chart has somewhere to grow into rather than ending at the last dot.
    const horizonDays = Math.min(1856, Math.max(ageInDays(child.dob) * 1.25, 200));

    const zLines = req.valid?.query?.zLines
      ? req.valid.query.zLines.split(',').map(Number).filter(Number.isFinite)
      : [-3, -2, -1, 0, 1, 2, 3];

    res.json({
      indicator: INDICATORS[indicator],
      reference: referenceCurves({ indicator, sex: child.sex, toDays: horizonDays, zLines }),
      points,
    });
  },
);

/* ------------------------------------------------------------------ *
 * Milestones
 * ------------------------------------------------------------------ */

childrenRouter.get('/:childId/milestones', validate({ params: childParams }), loadChild, async (req, res) => {
  const now = new Date();
  const ageMonths = calendarAge(req.child.dob, now).months;
  const records = await MilestoneRecord.find({ childId: req.child._id });
  const byKey = new Map(records.map((r) => [r.milestoneKey, r]));

  const items = MILESTONES.map((m) => {
    const record = byKey.get(m.key);
    const isAchieved = record?.status === 'achieved';
    return {
      ...m,
      domainLabel: DOMAINS[m.domain].label,
      status: isAchieved ? 'achieved' : record?.status === 'not_yet' ? 'not_yet' : 'unrecorded',
      achievedAt: record?.achievedAt ?? null,
      note: record?.note ?? null,
      due: ageMonths >= m.months,
      overdue: !isAchieved && ageMonths >= m.months + graceMonths(m.months),
    };
  });

  res.json({
    ageMonths,
    checkpoints: CHECKPOINTS.map((months) => {
      const forCheckpoint = items.filter((i) => i.months === months);
      return {
        months,
        status: months > ageMonths ? 'upcoming' : forCheckpoint.every((i) => i.status === 'achieved') ? 'complete' : 'in-progress',
        achieved: forCheckpoint.filter((i) => i.status === 'achieved').length,
        total: forCheckpoint.length,
      };
    }),
    domains: Object.values(DOMAINS),
    items,
    source: MILESTONE_SOURCE,
  });
});

childrenRouter.put(
  '/:childId/milestones/:milestoneKey',
  validate({
    params: childParams.extend({ milestoneKey: z.string().min(1) }),
    body: z.object({
      status: z.enum(['achieved', 'not_yet']),
      achievedAt: pastDate.optional(),
      note: z.string().max(500).optional(),
    }),
  }),
  loadChild,
  async (req, res) => {
    const milestone = MILESTONE_BY_KEY.get(req.params.milestoneKey);
    if (!milestone) throw notFound('No such milestone');

    const record = await MilestoneRecord.findOneAndUpdate(
      { childId: req.child._id, milestoneKey: milestone.key },
      {
        $set: {
          status: req.body.status,
          achievedAt: req.body.status === 'achieved' ? (req.body.achievedAt ?? new Date()) : null,
          ...(req.body.note !== undefined ? { note: req.body.note } : {}),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.json({ record: record.toJSON(), milestone });
  },
);

/* ------------------------------------------------------------------ *
 * Immunisation
 * ------------------------------------------------------------------ */

childrenRouter.get('/:childId/immunisation', validate({ params: childParams }), loadChild, async (req, res) => {
  const records = await VaccineRecord.find({ childId: req.child._id });
  res.json(buildImmunisationPlan({ dob: req.child.dob, records }));
});

childrenRouter.put(
  '/:childId/immunisation/:vaccineKey',
  validate({
    params: childParams.extend({ vaccineKey: z.string().min(1) }),
    body: z.object({ administeredAt: pastDate.default(() => new Date()), note: z.string().max(500).optional() }),
  }),
  loadChild,
  async (req, res) => {
    const dose = SCHEDULE_BY_KEY.get(req.params.vaccineKey);
    if (!dose) throw notFound('No such vaccine dose');
    if (new Date(req.body.administeredAt) < new Date(req.child.dob)) {
      throw badRequest('A dose cannot predate the child’s date of birth');
    }

    const record = await VaccineRecord.findOneAndUpdate(
      { childId: req.child._id, vaccineKey: dose.key },
      { $set: { administeredAt: req.body.administeredAt, ...(req.body.note !== undefined ? { note: req.body.note } : {}) } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.json({ record: record.toJSON(), dose });
  },
);

childrenRouter.delete(
  '/:childId/immunisation/:vaccineKey',
  validate({ params: childParams.extend({ vaccineKey: z.string().min(1) }) }),
  loadChild,
  async (req, res) => {
    await VaccineRecord.deleteOne({ childId: req.child._id, vaccineKey: req.params.vaccineKey });
    res.json({ ok: true });
  },
);
