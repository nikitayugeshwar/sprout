/**
 * Insight engine.
 *
 * Turns a child's raw record into a short, ranked list of things a parent can
 * actually act on. Every insight is derived deterministically from the data and
 * carries the evidence that produced it — no black boxes, and nothing that
 * reads as a diagnosis.
 *
 * The deliberate design constraint: say fewer, better things. A dashboard that
 * flags everything trains people to ignore it.
 */
import { assess, series, describeAge, ageInMonths, INDICATORS } from '../growth/index.js';
import { MILESTONES, graceMonths, DOMAINS } from '../milestones/catalog.js';
import { buildImmunisationPlan } from '../vaccines/schedule.js';

/**
 * One "channel" on a printed growth chart is ~0.67 SD wide. Crossing a channel
 * downwards between visits is the classic paediatric trigger for a closer look,
 * which is why this is the threshold rather than a round number.
 */
const CHANNEL = 0.67;

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

/** How long we let a growth record go stale before nudging, by age. */
function staleAfterDays(ageMonths) {
  if (ageMonths < 6) return 45;
  if (ageMonths < 24) return 100;
  return 200;
}

function growthInsights({ child, measurements, now }) {
  if (!measurements.length) {
    return [
      {
        id: 'growth-none',
        category: 'growth',
        severity: 'medium',
        title: 'No growth measurements yet',
        body: `Add ${child.name}'s weight and height to start plotting against the WHO growth standards.`,
        action: 'Add a measurement',
      },
    ];
  }

  const out = [];
  /**
   * High-severity findings are collected rather than pushed directly. Weight
   * faltering fires weight-for-age *and* BMI-for-age at once, and two cards
   * saying the same thing in different words is exactly the noise this engine
   * is supposed to avoid — so they get merged below.
   */
  const alerts = [];

  const latest = [...measurements].sort((a, b) => new Date(b.takenAt) - new Date(a.takenAt))[0];
  const { results } = assess({ sex: child.sex, dob: child.dob, measurement: latest });

  for (const indicator of ['wfa', 'lhfa', 'bfa', 'hcfa']) {
    const r = results[indicator];
    if (!r) continue;

    const points = series({ sex: child.sex, dob: child.dob, measurements, indicator });
    const drift = points.length >= 2 ? points[points.length - 1].z - points[0].z : 0;
    const falling = drift <= -CHANNEL;
    const climbing = drift >= CHANNEL;

    const evidence = {
      indicator,
      label: INDICATORS[indicator].label,
      value: r.value,
      unit: r.unit,
      z: r.z,
      percentile: r.percentile,
      drift: Math.round(drift * 100) / 100,
      readings: points.length,
    };

    if (r.tone === 'critical' || (r.tone === 'warning' && falling)) {
      alerts.push({ indicator, r, drift, falling, points, evidence });
      continue;
    }

    if (r.tone === 'warning') {
      out.push({
        id: `growth-${indicator}-watch`,
        category: 'growth',
        severity: 'medium',
        title: `${r.classificationLabel}`,
        body: `Latest ${INDICATORS[indicator].short.toLowerCase()} sits ${percentilePhrase(r.percentile)}. Keep measuring so we can see whether it is a trend or a single reading.`,
        action: 'Keep tracking',
        evidence,
      });
      continue;
    }

    if (falling) {
      out.push({
        id: `growth-${indicator}-drift`,
        category: 'growth',
        severity: 'medium',
        title: `${INDICATORS[indicator].short} is drifting down its curve`,
        body: `Still in the healthy range, but ${child.name} has crossed a percentile channel (${drift.toFixed(2)} SD) since the first reading. Children usually track along their own curve.`,
        action: 'Watch the next reading',
        evidence,
      });
    } else if (climbing && indicator === 'bfa') {
      out.push({
        id: 'growth-bfa-climb',
        category: 'growth',
        severity: 'low',
        title: 'BMI is climbing its curve',
        body: `BMI-for-age has risen ${drift.toFixed(2)} SD across ${points.length} readings while staying in the healthy band.`,
        action: 'Watch the next reading',
        evidence,
      });
    }
  }

  // Merge the high-severity findings into a single card, led by the indicator
  // furthest from the median and corroborated by the rest.
  if (alerts.length) {
    alerts.sort((a, b) => a.r.z - b.r.z);
    const lead = alerts[0];
    const others = alerts.slice(1);

    out.push({
      id: `growth-${lead.indicator}-alert`,
      category: 'growth',
      severity: 'high',
      title: `${lead.r.classificationLabel} on ${INDICATORS[lead.indicator].prose}`,
      body:
        `${child.name} is ${percentilePhrase(lead.r.percentile)} (z = ${lead.r.z.toFixed(2)})` +
        (lead.falling ? `, having moved ${Math.abs(lead.drift).toFixed(1)} SD down across ${lead.points.length} readings` : '') +
        '. ' +
        (others.length
          ? `${others.map((o) => `${INDICATORS[o.indicator].label} agrees (z = ${o.r.z.toFixed(2)})`).join(', and ')}. `
          : '') +
        'This is worth raising at your next paediatric visit.',
      action: 'Discuss with your paediatrician',
      evidence: { ...lead.evidence, corroboratedBy: others.map((o) => ({ indicator: o.indicator, z: o.r.z })) },
    });
  }

  const daysSince = Math.floor((now - new Date(latest.takenAt)) / 86_400_000);
  const limit = staleAfterDays(ageInMonths(child.dob, now));
  if (daysSince > limit) {
    out.push({
      id: 'growth-stale',
      category: 'growth',
      severity: 'low',
      title: `Last measured ${daysSince} days ago`,
      body: `At ${describeAge(child.dob, now)}, a reading every ${Math.round(limit / 30)} months keeps the trend meaningful.`,
      action: 'Add a measurement',
      evidence: { daysSince },
    });
  }

  if (!out.length) {
    const wfa = results.wfa ?? Object.values(results)[0];
    out.push({
      id: 'growth-ok',
      category: 'growth',
      severity: 'low',
      title: 'Growth is tracking well',
      body: `Every indicator we can calculate sits in the healthy WHO range${wfa ? `, with weight ${percentilePhrase(wfa.percentile)}` : ''}.`,
      action: null,
      tone: 'good',
    });
  }

  return out;
}

function milestoneInsights({ child, milestoneRecords, now }) {
  const ageM = ageInMonths(child.dob, now);
  const achieved = new Set(milestoneRecords.filter((r) => r.status === 'achieved').map((r) => r.milestoneKey));

  const overdue = MILESTONES.filter((m) => ageM >= m.months + graceMonths(m.months) && !achieved.has(m.key));
  if (!overdue.length) return [];

  // Only the most recent checkpoint the child has fully passed is actionable —
  // listing every unticked box since birth would be noise.
  const latestCheckpoint = Math.max(...overdue.map((m) => m.months));
  const current = overdue.filter((m) => m.months === latestCheckpoint);

  const byDomain = current.reduce((acc, m) => ({ ...acc, [m.domain]: (acc[m.domain] ?? 0) + 1 }), {});
  const worstDomain = Object.entries(byDomain).sort((a, b) => b[1] - a[1])[0];
  const severity = current.length >= 4 ? 'high' : current.length >= 2 ? 'medium' : 'low';

  return [
    {
      id: `milestone-${latestCheckpoint}`,
      category: 'milestone',
      severity,
      title: `${current.length} unticked milestone${current.length === 1 ? '' : 's'} from the ${latestCheckpoint}-month checklist`,
      body:
        `Most children can do these by ${latestCheckpoint} months — the largest gap is in ${DOMAINS[worstDomain[0]].label.toLowerCase()}. ` +
        'Ticking what they can already do takes a minute and makes the picture accurate.',
      action: 'Review the checklist',
      evidence: {
        checkpoint: latestCheckpoint,
        outstanding: current.length,
        byDomain,
        examples: current.slice(0, 3).map((m) => m.text),
      },
    },
  ];
}

function immunisationInsights({ child, vaccineRecords, now }) {
  const plan = buildImmunisationPlan({ dob: child.dob, records: vaccineRecords, now });
  const out = [];

  const late = plan.doses.filter((d) => d.status === 'overdue');
  const missed = plan.doses.filter((d) => d.status === 'missed');

  if (late.length || missed.length) {
    const worst = [...late, ...missed].sort((a, b) => b.daysOverdue - a.daysOverdue)[0];
    out.push({
      id: 'immunisation-overdue',
      category: 'immunisation',
      severity: late.length + missed.length >= 3 ? 'high' : 'medium',
      title: `${late.length + missed.length} dose${late.length + missed.length === 1 ? '' : 's'} not recorded as given`,
      body:
        `The oldest is ${worst.vaccine} ${worst.doseLabel.toLowerCase()}, due ${worst.daysOverdue} days ago.` +
        (missed.length ? ` ${missed.length} of these are past their catch-up window.` : ' Most can still be caught up.'),
      action: 'Update the immunisation record',
      evidence: { overdue: late.length, missed: missed.length, coverage: plan.coverage },
    });
  }

  const soon = plan.doses.filter((d) => d.dueSoon);
  if (soon.length) {
    const next = soon[0];
    out.push({
      id: 'immunisation-due-soon',
      category: 'immunisation',
      severity: 'low',
      title: `${next.visit} visit coming up`,
      body: `${soon.length} dose${soon.length === 1 ? '' : 's'} due in ${Math.max(next.daysUntilDue, 0)} days, starting with ${next.vaccine}.`,
      action: 'Book the visit',
      evidence: { doses: soon.map((d) => `${d.vaccine} ${d.doseLabel}`), dueDate: next.dueDate },
    });
  }

  if (!out.length && plan.counts.given > 0) {
    out.push({
      id: 'immunisation-ok',
      category: 'immunisation',
      severity: 'low',
      title: 'Immunisation is up to date',
      body: `All ${plan.counts.given} dose${plan.counts.given === 1 ? '' : 's'} due so far are recorded.${plan.nextDue ? ` Next up: ${plan.nextDue.visit}.` : ''}`,
      action: null,
      tone: 'good',
    });
  }

  return out;
}

/**
 * @returns insights ranked high → low, capped so the dashboard stays readable.
 */
export function buildInsights({ child, measurements = [], milestoneRecords = [], vaccineRecords = [], now = new Date(), limit = 6 }) {
  const all = [
    ...growthInsights({ child, measurements, now }),
    ...milestoneInsights({ child, milestoneRecords, now }),
    ...immunisationInsights({ child, vaccineRecords, now }),
  ];

  return all
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, limit)
    .map((i) => ({ tone: i.severity === 'high' ? 'critical' : i.severity === 'medium' ? 'warning' : 'info', ...i }));
}

/**
 * Percentile as a sentence fragment.
 *
 * The tails need different grammar: "on the below 1st percentile" is not
 * English, so the extremes get their own phrasing rather than being forced
 * through the ordinal template.
 */
function percentilePhrase(n) {
  if (n < 1) return 'below the 1st percentile';
  if (n > 99) return 'above the 99th percentile';
  return `on the ${ordinal(n)} percentile`;
}

function ordinal(n) {
  const v = Math.round(n);
  if (v <= 0) return '1st';
  if (v >= 100) return '99th';
  const s = ['th', 'st', 'nd', 'rd'];
  const m = v % 100;
  return v + (s[(m - 20) % 10] ?? s[m] ?? s[0]);
}
