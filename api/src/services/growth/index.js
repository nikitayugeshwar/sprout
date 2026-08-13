/**
 * Growth assessment service: turns raw measurements into WHO z-scores,
 * percentiles, clinical classifications and chart-ready reference curves.
 */
import { zScore, percentileFromZ, valueAtZ } from './lms.js';
import { lmsAt, tableFor, tableRange, INDICATORS, DAYS_PER_MONTH } from './tables.js';

const DAY = 86_400_000;

export { INDICATORS, DAYS_PER_MONTH };

export function ageInDays(dob, at = new Date()) {
  return Math.floor((new Date(at) - new Date(dob)) / DAY);
}

/**
 * Decimal age in months on WHO's convention (1 month = 30.4375 days).
 * Used for threshold comparisons against the reference tables — for anything a
 * parent reads, use `calendarAge`/`describeAge` instead.
 */
export function ageInMonths(dob, at = new Date()) {
  return ageInDays(dob, at) / DAYS_PER_MONTH;
}

/**
 * Calendar age: completed months plus leftover days.
 *
 * Averaged months are wrong here — 365 days is 11.99 average-months, so a child
 * on their first birthday would be shown as "11 months, 4 weeks". Parents count
 * calendar months, so we do too.
 */
export function calendarAge(dob, at = new Date()) {
  const a = startOfDayUtc(dob);
  const b = startOfDayUtc(at);

  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (anchor(a, months) > b) months -= 1;

  return { months, days: Math.floor((b - anchor(a, months)) / DAY) };
}

/**
 * `a` shifted by n months, clamped to the end of shorter months so that
 * 31 Jan + 1 month is 28/29 Feb rather than spilling into March.
 */
function anchor(a, months) {
  const y = a.getUTCFullYear();
  const m = a.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(a.getUTCDate(), lastDay)));
}

function startOfDayUtc(d) {
  const x = new Date(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
}

/**
 * Human-readable age, the way a parent says it: "4 months, 2 weeks".
 */
export function describeAge(dob, at = new Date()) {
  const totalDays = ageInDays(dob, at);
  if (totalDays < 0) return 'not born yet';
  if (totalDays < 14) return `${totalDays} day${totalDays === 1 ? '' : 's'}`;
  if (totalDays < 61) {
    const weeks = Math.floor(totalDays / 7);
    return `${weeks} week${weeks === 1 ? '' : 's'}`;
  }

  const { months, days } = calendarAge(dob, at);
  if (months < 24) {
    const weeks = Math.floor(days / 7);
    return weeks > 0 ? `${months} months, ${weeks} week${weeks === 1 ? '' : 's'}` : `${months} months`;
  }

  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${years}y ${rem}m` : `${years} years`;
}

/**
 * WHO classification cut-offs.
 *
 * Sources: WHO Child Growth Standards / "WHO child growth standards and the
 * identification of severe acute malnutrition in infants and children" (2009)
 * for the weight and BMI bands.
 */
const BANDS = {
  wfa: [
    { max: -3, key: 'severely-underweight', label: 'Severely underweight', tone: 'critical' },
    { max: -2, key: 'underweight', label: 'Underweight', tone: 'warning' },
    { max: 2, key: 'healthy', label: 'Healthy weight for age', tone: 'good' },
    { max: Infinity, key: 'high-weight', label: 'High weight for age', tone: 'info', hint: 'Read alongside BMI-for-age' },
  ],
  lhfa: [
    { max: -3, key: 'severely-stunted', label: 'Severely stunted', tone: 'critical' },
    { max: -2, key: 'stunted', label: 'Stunted', tone: 'warning' },
    { max: 2, key: 'healthy', label: 'Healthy height for age', tone: 'good' },
    { max: Infinity, key: 'tall', label: 'Tall for age', tone: 'info' },
  ],
  bfa: [
    { max: -3, key: 'severely-wasted', label: 'Severely wasted', tone: 'critical' },
    { max: -2, key: 'wasted', label: 'Wasted', tone: 'warning' },
    { max: 1, key: 'healthy', label: 'Healthy BMI for age', tone: 'good' },
    { max: 2, key: 'risk-overweight', label: 'Possible risk of overweight', tone: 'info' },
    { max: 3, key: 'overweight', label: 'Overweight', tone: 'warning' },
    { max: Infinity, key: 'obese', label: 'Obese', tone: 'critical' },
  ],
  hcfa: [
    { max: -2, key: 'below-range', label: 'Below the expected range', tone: 'warning' },
    { max: 2, key: 'healthy', label: 'Typical head circumference', tone: 'good' },
    { max: Infinity, key: 'above-range', label: 'Above the expected range', tone: 'warning' },
  ],
};

export function classify(indicator, z) {
  return BANDS[indicator].find((b) => z < b.max) ?? BANDS[indicator][BANDS[indicator].length - 1];
}

export function bmiFrom(weightKg, heightCm) {
  if (!weightKg || !heightCm) return null;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/**
 * Assess one measurement across every indicator we have a value for.
 * Indicators without an input value — or outside the WHO table's age range —
 * are simply absent from the result rather than reported as zero.
 */
export function assess({ sex, dob, measurement }) {
  const takenAt = new Date(measurement.takenAt);
  const days = ageInDays(dob, takenAt);

  const values = {
    wfa: measurement.weightKg ?? null,
    lhfa: measurement.heightCm ?? null,
    bfa: bmiFrom(measurement.weightKg, measurement.heightCm),
    hcfa: measurement.headCircumferenceCm ?? null,
  };

  const results = {};
  for (const [indicator, value] of Object.entries(values)) {
    if (value == null || !Number.isFinite(value) || value <= 0) continue;

    const lms = lmsAt(indicator, sex, days);
    if (!lms) continue;

    const z = zScore(lms, value, indicator);
    const band = classify(indicator, z);

    results[indicator] = {
      indicator,
      label: INDICATORS[indicator].label,
      unit: INDICATORS[indicator].unit,
      value: round(value, 2),
      z: round(z, 2),
      percentile: round(percentileFromZ(z), 1),
      median: round(lms.m, 2),
      classification: band.key,
      classificationLabel: band.label,
      tone: band.tone,
      hint: band.hint ?? null,
    };
  }

  return { ageDays: days, ageMonths: round(days / DAYS_PER_MONTH, 1), results };
}

/**
 * Longitudinal z-score series for one indicator.
 *
 * `delta` is the change since the previous point. A child tracking healthily
 * follows their own percentile channel, so a sustained z-score drift matters
 * more than any single reading — this is what the insight engine watches.
 */
export function series({ sex, dob, measurements, indicator }) {
  const points = [];

  for (const m of [...measurements].sort((a, b) => new Date(a.takenAt) - new Date(b.takenAt))) {
    const { ageDays, results } = assess({ sex, dob, measurement: m });
    const r = results[indicator];
    if (!r) continue;

    const prev = points[points.length - 1];
    points.push({
      id: String(m._id ?? m.id ?? ''),
      takenAt: new Date(m.takenAt).toISOString(),
      ageDays,
      ageMonths: round(ageDays / DAYS_PER_MONTH, 2),
      value: r.value,
      z: r.z,
      percentile: r.percentile,
      classification: r.classification,
      tone: r.tone,
      delta: prev ? round(r.z - prev.z, 2) : null,
    });
  }

  return points;
}

/**
 * Reference percentile curves for plotting.
 *
 * Returns the value at each requested z-line across the age window, sampled
 * densely enough to draw as a smooth polyline in the browser without shipping
 * the whole LMS table to the client.
 */
export function referenceCurves({ indicator, sex, fromDays = 0, toDays, zLines = [-3, -2, -1, 0, 1, 2, 3], samples = 120 }) {
  const range = tableRange(indicator, sex);
  const start = Math.max(fromDays, range.minDays);
  const end = Math.min(toDays ?? range.maxDays, range.maxDays);
  const step = (end - start) / (samples - 1);

  const ages = [];
  const curves = Object.fromEntries(zLines.map((z) => [z, []]));

  for (let i = 0; i < samples; i += 1) {
    const days = start + step * i;
    const lms = lmsAt(indicator, sex, days);
    if (!lms) continue;

    ages.push(round(days / DAYS_PER_MONTH, 3));
    for (const z of zLines) curves[z].push(round(valueAtZ(lms, z), 3));
  }

  return {
    indicator,
    label: INDICATORS[indicator].label,
    unit: INDICATORS[indicator].unit,
    sex,
    ageMonths: ages,
    curves,
    percentileOf: Object.fromEntries(zLines.map((z) => [z, round(percentileFromZ(z), 1)])),
    source: tableFor(indicator, sex).source,
    standard: 'WHO Child Growth Standards (2006)',
  };
}

function round(n, dp) {
  if (n == null || !Number.isFinite(n)) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
