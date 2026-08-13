/**
 * The growth engine is the part of Sprout that can be silently, plausibly wrong
 * — a z-score of -1.6 looks just as reasonable as the correct -2.1. So rather
 * than assert against numbers we made up, we assert against WHO's own published
 * SD cut-off columns, extracted from the same workbooks by the build script.
 *
 * If our LMS maths drifts, these fail.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { valueAtZ, rawZScore, zScore, normalCdf, percentileFromZ } from '../src/services/growth/lms.js';
import { lmsAt, tableFor, INDICATORS } from '../src/services/growth/tables.js';
import { assess, classify, bmiFrom, describeAge, series } from '../src/services/growth/index.js';
import { buildImmunisationPlan, SCHEDULE } from '../src/services/vaccines/schedule.js';
import { MILESTONES, CHECKPOINTS, MILESTONE_BY_KEY } from '../src/services/milestones/catalog.js';
import { buildInsights } from '../src/services/insights/engine.js';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const Z_COLUMNS = [-3, -2, -1, 0, 1, 2, 3];
const SEXES = ['male', 'female'];

function fixture(indicator, sex) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, `who-sd-${indicator}-${sex}.json`), 'utf8'));
}

test('LMS values reproduce WHO published SD cut-offs for every indicator', async (t) => {
  for (const indicator of Object.keys(INDICATORS)) {
    for (const sex of SEXES) {
      await t.test(`${indicator} / ${sex}`, () => {
        const fx = fixture(indicator, sex);
        assert.ok(fx.rows.length > 30, 'expected a meaningful number of fixture rows');

        let checked = 0;
        let worst = 0;

        for (const [ageDays, ...published] of fx.rows) {
          const lms = lmsAt(indicator, sex, ageDays);
          assert.ok(lms, `no LMS for ${indicator}/${sex} at day ${ageDays}`);

          // Fixture columns are SD3neg..SD3, i.e. z = -3..+3 in order.
          published.forEach((expected, i) => {
            const actual = valueAtZ(lms, Z_COLUMNS[i]);
            const diff = Math.abs(actual - expected);
            worst = Math.max(worst, diff);
            assert.ok(
              diff < 0.01,
              `${indicator}/${sex} day ${ageDays} z=${Z_COLUMNS[i]}: got ${actual.toFixed(4)}, WHO publishes ${expected}`,
            );
            checked += 1;
          });
        }

        assert.ok(checked > 400, `only ${checked} comparisons made`);
        // Surfaced so a regression that stays under tolerance is still visible.
        assert.ok(worst < 0.01, `worst deviation ${worst}`);
      });
    }
  }
});

test('z-score inverts valueAtZ (round trip) within the modelled range', () => {
  for (const indicator of Object.keys(INDICATORS)) {
    for (const sex of SEXES) {
      for (const day of [0, 45, 200, 700, 1400, 1856]) {
        const lms = lmsAt(indicator, sex, day);
        for (const z of [-2.5, -1, 0, 0.7, 2.5]) {
          const back = rawZScore(lms, valueAtZ(lms, z));
          assert.ok(Math.abs(back - z) < 1e-9, `${indicator}/${sex} day ${day} z=${z} -> ${back}`);
        }
      }
    }
  }
});

test("WHO's extreme-tail correction applies to weight-based indicators only", () => {
  const day = 365;

  // Height-for-age is normally distributed; no correction, so raw == corrected.
  const height = lmsAt('lhfa', 'male', day);
  const tallValue = valueAtZ(height, 4);
  assert.equal(zScore(height, tallValue, 'lhfa').toFixed(6), rawZScore(height, tallValue).toFixed(6));

  // Weight-for-age beyond +3 SD is linearised, so the corrected score must
  // differ from the raw Box-Cox score and stay finite and monotonic.
  const weight = lmsAt('wfa', 'male', day);
  const heavy = valueAtZ(weight, 3) * 1.35;
  const corrected = zScore(weight, heavy, 'wfa');
  assert.notEqual(corrected.toFixed(4), rawZScore(weight, heavy).toFixed(4));
  assert.ok(corrected > 3 && Number.isFinite(corrected));
  assert.ok(zScore(weight, heavy * 1.1, 'wfa') > corrected, 'correction must stay monotonic');

  // Exactly at ±3 SD the two definitions must agree — no discontinuity.
  const at3 = valueAtZ(weight, 3);
  assert.ok(Math.abs(zScore(weight, at3, 'wfa') - 3) < 1e-9);
});

test('normal CDF matches known reference values', () => {
  const cases = [
    [0, 0.5],
    [1, 0.8413447461],
    [-1, 0.1586552539],
    [1.959963985, 0.975],
    [-2.575829304, 0.005],
    [3, 0.9986501020],
  ];
  for (const [z, expected] of cases) {
    assert.ok(Math.abs(normalCdf(z) - expected) < 1e-9, `Phi(${z}) = ${normalCdf(z)}, expected ${expected}`);
  }
  assert.ok(Math.abs(percentileFromZ(0) - 50) < 1e-9);
});

test('LMS lookup interpolates between rows and refuses to extrapolate', () => {
  const t = tableFor('wfa', 'male');
  const a = t.lms[100];
  const b = t.lms[101];
  const mid = lmsAt('wfa', 'male', 100.5);

  assert.ok(Math.abs(mid.m - (a.m + b.m) / 2) < 1e-9, 'median should be the midpoint');
  assert.ok(mid.m > a.m && mid.m < b.m);

  assert.equal(lmsAt('wfa', 'male', -1), null);
  assert.equal(lmsAt('wfa', 'male', 5000), null);
});

test('assess() classifies a measurement against WHO bands', () => {
  const dob = new Date('2025-01-01T00:00:00Z');
  const takenAt = new Date('2026-01-01T00:00:00Z'); // 365 days

  const lms = lmsAt('wfa', 'male', 365);
  const medianWeight = lms.m;

  const { ageDays, results } = assess({
    sex: 'male',
    dob,
    measurement: { takenAt, weightKg: medianWeight, heightCm: 75.7 },
  });

  assert.equal(ageDays, 365);
  assert.ok(Math.abs(results.wfa.z) < 0.01, `median weight should be z~0, got ${results.wfa.z}`);
  assert.ok(Math.abs(results.wfa.percentile - 50) < 1);
  assert.equal(results.wfa.classification, 'healthy');
  assert.ok(results.bfa, 'BMI-for-age should be derived from weight + height');
  assert.equal(results.hcfa, undefined, 'no head circumference supplied');

  // A clearly underweight child must be flagged, not smoothed over.
  const low = assess({ sex: 'male', dob, measurement: { takenAt, weightKg: valueAtZ(lms, -2.5) } });
  assert.equal(low.results.wfa.classification, 'underweight');
  assert.equal(low.results.wfa.tone, 'warning');

  assert.equal(classify('bfa', 2.5).key, 'overweight');
  assert.equal(classify('lhfa', -3.4).key, 'severely-stunted');
});

test('BMI and age formatting behave sensibly', () => {
  assert.ok(Math.abs(bmiFrom(10, 75) - 17.7778) < 1e-3);
  assert.equal(bmiFrom(null, 75), null);

  const now = new Date('2026-06-15T00:00:00Z');
  assert.equal(describeAge(new Date('2026-06-10T00:00:00Z'), now), '5 days');
  assert.equal(describeAge(new Date('2026-05-01T00:00:00Z'), now), '6 weeks');
  assert.match(describeAge(new Date('2025-06-15T00:00:00Z'), now), /^12 months/);
  assert.match(describeAge(new Date('2022-06-15T00:00:00Z'), now), /^4 years$/);
});

test('series() tracks z-score drift between visits', () => {
  const dob = new Date('2025-01-01T00:00:00Z');
  const at = (days) => new Date(dob.getTime() + days * 86_400_000);

  const measurements = [90, 180, 270].map((d) => ({
    _id: `m${d}`,
    takenAt: at(d),
    // Deliberately walk the child down from the median towards -1.5 SD.
    weightKg: valueAtZ(lmsAt('wfa', 'male', d), d === 90 ? 0 : d === 180 ? -0.8 : -1.5),
  }));

  const pts = series({ sex: 'male', dob, measurements, indicator: 'wfa' });
  assert.equal(pts.length, 3);
  assert.equal(pts[0].delta, null);
  assert.ok(pts[1].delta < -0.7 && pts[1].delta > -0.9);
  assert.ok(pts[2].z < pts[1].z, 'z-score must be falling');
  assert.deepEqual(
    pts.map((p) => p.ageDays),
    [90, 180, 270],
  );
});

test('immunisation plan derives status from date of birth', () => {
  const now = new Date('2026-08-13T00:00:00Z');

  // Child is ~7 months old with nothing recorded.
  const plan = buildImmunisationPlan({ dob: new Date('2026-01-10T00:00:00Z'), records: [], now });
  assert.equal(plan.doses.length, SCHEDULE.length);
  assert.ok(plan.counts.overdue + plan.counts.missed > 0, 'unrecorded due doses must be flagged');
  assert.equal(plan.counts.given, 0);
  assert.equal(plan.coverage, 0);

  const birthDose = plan.doses.find((d) => d.key === 'bcg-1');
  assert.equal(birthDose.dueDate.slice(0, 10), '2026-01-10');
  assert.equal(birthDose.status, 'overdue');

  const sixWeek = plan.doses.find((d) => d.key === 'dtp-1');
  assert.equal(sixWeek.dueDate.slice(0, 10), '2026-02-21'); // dob + 42 days

  // Rotavirus dose 1 can no longer be started after 15 weeks.
  assert.equal(plan.doses.find((d) => d.key === 'rota-1').status, 'missed');

  // A baby born today has nothing due yet, so coverage is 1 (fully covered for
  // their age) rather than 0 — the denominator is doses due, not doses total.
  const newborn = buildImmunisationPlan({ dob: now, records: [], now });
  assert.equal(newborn.coverage, 1);
  assert.equal(newborn.counts.overdue, 0);
  assert.equal(newborn.nextDue.key, 'bcg-1');

  // Recording a dose flips it to given and lifts coverage.
  const withRecord = buildImmunisationPlan({
    dob: new Date('2026-01-10T00:00:00Z'),
    records: [{ vaccineKey: 'bcg-1', administeredAt: new Date('2026-01-10T00:00:00Z') }],
    now,
  });
  assert.equal(withRecord.doses.find((d) => d.key === 'bcg-1').status, 'given');
  assert.ok(withRecord.coverage > 0);
});

test('milestone catalogue is well formed', () => {
  assert.ok(MILESTONES.length > 100);
  assert.equal(new Set(MILESTONES.map((m) => m.key)).size, MILESTONES.length, 'keys must be unique');

  for (const cp of CHECKPOINTS) {
    const domains = new Set(MILESTONES.filter((m) => m.months === cp).map((m) => m.domain));
    assert.equal(domains.size, 4, `checkpoint ${cp}m should cover all four domains`);
  }
  assert.equal(MILESTONE_BY_KEY.get('m12-motor-1').text, 'Pulls up to stand');
});

test('insight engine escalates the things a parent should act on', () => {
  const dob = new Date('2025-02-01T00:00:00Z');
  const now = new Date('2026-08-13T00:00:00Z'); // ~18 months

  const falling = [200, 400, 550].map((d) => ({
    _id: `m${d}`,
    takenAt: new Date(dob.getTime() + d * 86_400_000),
    weightKg: valueAtZ(lmsAt('wfa', 'male', d), d === 200 ? 0.2 : d === 400 ? -0.9 : -2.3),
    heightCm: valueAtZ(lmsAt('lhfa', 'male', d), 0),
  }));

  const insights = buildInsights({
    child: { name: 'Test', sex: 'male', dob },
    measurements: falling,
    milestoneRecords: [],
    vaccineRecords: [],
    now,
  });

  assert.ok(insights.length > 0);
  const growth = insights.find((i) => i.category === 'growth');
  assert.ok(growth, 'a falling weight trajectory must produce a growth insight');
  assert.equal(growth.severity, 'high');
  assert.ok(insights.some((i) => i.category === 'immunisation'));
  // Highest severity first.
  const rank = { high: 0, medium: 1, low: 2 };
  const ranks = insights.map((i) => rank[i.severity]);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
});
