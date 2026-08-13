/**
 * Deterministic demo data.
 *
 * "Try the demo" provisions a brand-new, isolated account per visitor rather
 * than sharing one login — so a reviewer can add, edit and delete anything
 * without spoiling the tour for the next person.
 *
 * The two children are written to tell a story rather than to look tidy:
 *
 *   Aarav (18m) — everything on track. Shows the calm, all-clear state.
 *   Meera (8m)  — weight faltering while length tracks normally, plus two
 *                 missed doses. This is a textbook weight-faltering pattern,
 *                 and it is what makes the insight engine visibly earn its
 *                 place instead of printing green ticks.
 *
 * Ages are relative to "now", so the demo never goes stale.
 */
import { Child, Measurement, MilestoneRecord, VaccineRecord } from '../../models/index.js';
import { valueAtZ } from '../growth/lms.js';
import { lmsAt } from '../growth/tables.js';
import { bmiFrom } from '../growth/index.js';
import { MILESTONES } from '../milestones/catalog.js';
import { SCHEDULE, addOffset } from '../vaccines/schedule.js';

const DAY = 86_400_000;

/** mulberry32 — small, fast, and repeatable, so the demo looks identical every time. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PROFILES = [
  {
    name: 'Aarav',
    sex: 'male',
    ageDays: 548,
    seed: 20240517,
    visitDays: [3, 42, 70, 98, 182, 274, 365, 456, 540],
    // Tracks steadily just above the median — the healthy picture.
    z: { wfa: [0.35, 0.4, 0.38, 0.42, 0.36, 0.4, 0.34, 0.38, 0.36], lhfa: 0.25, hcfa: 0.1 },
    milestonesThrough: 15,
    partialCheckpoint: 18,
    vaccinesThrough: 548,
    notes: 'Loves anything with wheels. Sleeps through most nights since 14 months.',
  },
  {
    name: 'Meera',
    sex: 'female',
    ageDays: 245,
    seed: 20250903,
    visitDays: [3, 42, 70, 98, 168, 240],
    // Weight drops away from the median while length holds — classic weight
    // faltering, and exactly the drift the insight engine watches for.
    z: { wfa: [0.1, -0.2, -0.65, -1.1, -1.7, -2.3], lhfa: 0.05, hcfa: -0.05 },
    milestonesThrough: 6,
    partialCheckpoint: 9,
    // Fell off the schedule after the 14-week visit.
    vaccinesThrough: 100,
    notes: 'Started solids at six months. Feeding has been slow going since.',
  },
];

function measure(sex, ageDays, indicator, z, jitter) {
  const lms = lmsAt(indicator, sex, ageDays);
  if (!lms) return null;
  return valueAtZ(lms, z + jitter);
}

const round = (n, dp) => (n == null ? null : Math.round(n * 10 ** dp) / 10 ** dp);

export function buildDemoPayload(userId, now = new Date()) {
  const children = [];

  for (const p of PROFILES) {
    const rand = rng(p.seed);
    const dob = new Date(now.getTime() - p.ageDays * DAY);
    const childId = new Child()._id;

    const measurements = p.visitDays
      .filter((d) => d <= p.ageDays)
      .map((day, i) => {
        // ±0.12 SD of measurement noise — real scales and tape measures are
        // not this obedient, and a perfectly smooth curve looks synthetic.
        const jitter = (rand() - 0.5) * 0.24;
        const wfaZ = Array.isArray(p.z.wfa) ? p.z.wfa[Math.min(i, p.z.wfa.length - 1)] : p.z.wfa;

        const weightKg = measure(p.sex, day, 'wfa', wfaZ, jitter);
        const heightCm = measure(p.sex, day, 'lhfa', p.z.lhfa, (rand() - 0.5) * 0.2);
        const headCircumferenceCm = measure(p.sex, day, 'hcfa', p.z.hcfa, (rand() - 0.5) * 0.2);

        return {
          childId,
          userId,
          takenAt: new Date(dob.getTime() + day * DAY),
          weightKg: round(weightKg, 2),
          heightCm: round(heightCm, 1),
          headCircumferenceCm: round(headCircumferenceCm, 1),
          source: day <= 3 || i % 2 === 0 ? 'clinic' : 'parent',
        };
      });

    const first = measurements[0];

    const milestoneRecords = MILESTONES.filter((m) => {
      if (m.months <= p.milestonesThrough) return true;
      // At the checkpoint they are currently working through, tick roughly
      // two-thirds — a half-finished checklist is what real usage looks like.
      if (m.months === p.partialCheckpoint) return rand() < 0.65;
      return false;
    }).map((m) => ({
      childId,
      milestoneKey: m.key,
      status: 'achieved',
      // Milestones get noticed a little after the checkpoint, not on the dot.
      achievedAt: new Date(dob.getTime() + (m.months * 30.4375 + rand() * 20) * DAY),
    }));

    const vaccineRecords = SCHEDULE.filter((d) => {
      const dueDay = Math.round((addOffset(dob, d.due) - dob) / DAY);
      return dueDay <= Math.min(p.vaccinesThrough, p.ageDays);
    }).map((d) => {
      const due = addOffset(dob, d.due);
      return {
        childId,
        vaccineKey: d.key,
        // Given on the due date or a few days after, as clinics actually run.
        administeredAt: new Date(due.getTime() + Math.floor(rand() * 6) * DAY),
      };
    });

    children.push({
      child: {
        _id: childId,
        userId,
        name: p.name,
        sex: p.sex,
        dob,
        birthWeightKg: round(measure(p.sex, 0, 'wfa', Array.isArray(p.z.wfa) ? p.z.wfa[0] : p.z.wfa, 0), 2),
        birthLengthCm: round(measure(p.sex, 0, 'lhfa', p.z.lhfa, 0), 1),
        notes: p.notes,
      },
      measurements,
      milestoneRecords,
      vaccineRecords,
      // Not persisted — handy for the seed script's summary output.
      _summary: { firstVisitBmi: round(bmiFrom(first.weightKg, first.heightCm), 1) },
    });
  }

  return children;
}

/** Writes a full demo dataset for `userId`. Returns the created children. */
export async function seedDemoData(userId, now = new Date()) {
  const payload = buildDemoPayload(userId, now);

  const children = await Child.insertMany(payload.map((p) => p.child));
  await Measurement.insertMany(payload.flatMap((p) => p.measurements));
  await MilestoneRecord.insertMany(payload.flatMap((p) => p.milestoneRecords));
  await VaccineRecord.insertMany(payload.flatMap((p) => p.vaccineRecords));

  return children;
}
