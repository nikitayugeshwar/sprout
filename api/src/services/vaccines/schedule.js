/**
 * Immunisation schedule engine.
 *
 * Doses follow the Indian Academy of Pediatrics (IAP) Advisory Committee on
 * Vaccines and Immunization Practices recommended schedule for children aged
 * 0–6 years, which is what an Indian parent's paediatrician will actually work
 * from. Every dose carries a catch-up window so a late dose is reported as
 * "overdue but still catchable" rather than simply "missed".
 *
 * This is a record-keeping and reminder aid, not medical advice — the API
 * returns the same disclaimer alongside the schedule.
 */

const w = (value) => ({ unit: 'week', value });
const mo = (value) => ({ unit: 'month', value });
const y = (value) => ({ unit: 'month', value: value * 12 });

/**
 * `key` is stable and is what a VaccineRecord references — never renumber it.
 */
export const SCHEDULE = [
  { key: 'bcg-1', visit: 'Birth', vaccine: 'BCG', dose: 1, due: w(0), catchUpBy: y(1), protects: 'Severe forms of tuberculosis', route: 'Intradermal' },
  { key: 'opv-0', visit: 'Birth', vaccine: 'OPV', dose: 0, due: w(0), catchUpBy: w(2), protects: 'Poliomyelitis', route: 'Oral' },
  { key: 'hepb-1', visit: 'Birth', vaccine: 'Hepatitis B', dose: 1, due: w(0), catchUpBy: w(6), protects: 'Hepatitis B', route: 'Intramuscular' },

  { key: 'dtp-1', visit: '6 weeks', vaccine: 'DTwP / DTaP', dose: 1, due: w(6), catchUpBy: y(7), protects: 'Diphtheria, tetanus, pertussis', route: 'Intramuscular' },
  { key: 'ipv-1', visit: '6 weeks', vaccine: 'IPV', dose: 1, due: w(6), catchUpBy: y(5), protects: 'Poliomyelitis', route: 'Intramuscular' },
  { key: 'hib-1', visit: '6 weeks', vaccine: 'Hib', dose: 1, due: w(6), catchUpBy: y(5), protects: 'Haemophilus influenzae type b', route: 'Intramuscular' },
  { key: 'hepb-2', visit: '6 weeks', vaccine: 'Hepatitis B', dose: 2, due: w(6), catchUpBy: y(5), protects: 'Hepatitis B', route: 'Intramuscular' },
  { key: 'rota-1', visit: '6 weeks', vaccine: 'Rotavirus', dose: 1, due: w(6), catchUpBy: w(15), protects: 'Rotavirus gastroenteritis', route: 'Oral' },
  { key: 'pcv-1', visit: '6 weeks', vaccine: 'PCV', dose: 1, due: w(6), catchUpBy: y(5), protects: 'Pneumococcal disease', route: 'Intramuscular' },

  { key: 'dtp-2', visit: '10 weeks', vaccine: 'DTwP / DTaP', dose: 2, due: w(10), catchUpBy: y(7), protects: 'Diphtheria, tetanus, pertussis', route: 'Intramuscular' },
  { key: 'ipv-2', visit: '10 weeks', vaccine: 'IPV', dose: 2, due: w(10), catchUpBy: y(5), protects: 'Poliomyelitis', route: 'Intramuscular' },
  { key: 'hib-2', visit: '10 weeks', vaccine: 'Hib', dose: 2, due: w(10), catchUpBy: y(5), protects: 'Haemophilus influenzae type b', route: 'Intramuscular' },
  { key: 'rota-2', visit: '10 weeks', vaccine: 'Rotavirus', dose: 2, due: w(10), catchUpBy: mo(8), protects: 'Rotavirus gastroenteritis', route: 'Oral' },
  { key: 'pcv-2', visit: '10 weeks', vaccine: 'PCV', dose: 2, due: w(10), catchUpBy: y(5), protects: 'Pneumococcal disease', route: 'Intramuscular' },

  { key: 'dtp-3', visit: '14 weeks', vaccine: 'DTwP / DTaP', dose: 3, due: w(14), catchUpBy: y(7), protects: 'Diphtheria, tetanus, pertussis', route: 'Intramuscular' },
  { key: 'ipv-3', visit: '14 weeks', vaccine: 'IPV', dose: 3, due: w(14), catchUpBy: y(5), protects: 'Poliomyelitis', route: 'Intramuscular' },
  { key: 'hib-3', visit: '14 weeks', vaccine: 'Hib', dose: 3, due: w(14), catchUpBy: y(5), protects: 'Haemophilus influenzae type b', route: 'Intramuscular' },
  { key: 'rota-3', visit: '14 weeks', vaccine: 'Rotavirus', dose: 3, due: w(14), catchUpBy: mo(8), protects: 'Rotavirus gastroenteritis', route: 'Oral', note: 'Third dose applies to the pentavalent rotavirus vaccine only' },
  { key: 'pcv-3', visit: '14 weeks', vaccine: 'PCV', dose: 3, due: w(14), catchUpBy: y(5), protects: 'Pneumococcal disease', route: 'Intramuscular' },

  { key: 'hepb-3', visit: '6 months', vaccine: 'Hepatitis B', dose: 3, due: mo(6), catchUpBy: y(5), protects: 'Hepatitis B', route: 'Intramuscular' },
  { key: 'opv-1', visit: '6 months', vaccine: 'OPV', dose: 1, due: mo(6), catchUpBy: y(5), protects: 'Poliomyelitis', route: 'Oral' },
  { key: 'flu-1', visit: '6 months', vaccine: 'Influenza', dose: 1, due: mo(6), catchUpBy: y(5), protects: 'Seasonal influenza', route: 'Intramuscular', note: 'Two doses four weeks apart the first year, then annually' },

  { key: 'opv-2', visit: '9 months', vaccine: 'OPV', dose: 2, due: mo(9), catchUpBy: y(5), protects: 'Poliomyelitis', route: 'Oral' },
  { key: 'mmr-1', visit: '9 months', vaccine: 'MMR', dose: 1, due: mo(9), catchUpBy: y(5), protects: 'Measles, mumps, rubella', route: 'Subcutaneous' },
  { key: 'tcv-1', visit: '9–12 months', vaccine: 'Typhoid conjugate', dose: 1, due: mo(9), catchUpBy: y(5), protects: 'Typhoid fever', route: 'Intramuscular' },

  { key: 'hepa-1', visit: '12 months', vaccine: 'Hepatitis A', dose: 1, due: mo(12), catchUpBy: y(5), protects: 'Hepatitis A', route: 'Intramuscular' },

  { key: 'mmr-2', visit: '15 months', vaccine: 'MMR', dose: 2, due: mo(15), catchUpBy: y(5), protects: 'Measles, mumps, rubella', route: 'Subcutaneous' },
  { key: 'var-1', visit: '15 months', vaccine: 'Varicella', dose: 1, due: mo(15), catchUpBy: y(5), protects: 'Chickenpox', route: 'Subcutaneous' },
  { key: 'pcv-b', visit: '15 months', vaccine: 'PCV', dose: 4, doseLabel: 'Booster', due: mo(15), catchUpBy: y(5), protects: 'Pneumococcal disease', route: 'Intramuscular' },

  { key: 'dtp-b1', visit: '16–18 months', vaccine: 'DTwP / DTaP', dose: 4, doseLabel: 'Booster 1', due: mo(16), catchUpBy: y(7), protects: 'Diphtheria, tetanus, pertussis', route: 'Intramuscular' },
  { key: 'ipv-b1', visit: '16–18 months', vaccine: 'IPV', dose: 4, doseLabel: 'Booster 1', due: mo(16), catchUpBy: y(5), protects: 'Poliomyelitis', route: 'Intramuscular' },
  { key: 'hib-b1', visit: '16–18 months', vaccine: 'Hib', dose: 4, doseLabel: 'Booster', due: mo(16), catchUpBy: y(5), protects: 'Haemophilus influenzae type b', route: 'Intramuscular' },
  { key: 'hepa-2', visit: '18 months', vaccine: 'Hepatitis A', dose: 2, due: mo(18), catchUpBy: y(5), protects: 'Hepatitis A', route: 'Intramuscular' },

  { key: 'tcv-b', visit: '2 years', vaccine: 'Typhoid conjugate', dose: 2, doseLabel: 'Booster', due: y(2), catchUpBy: y(6), protects: 'Typhoid fever', route: 'Intramuscular' },

  { key: 'dtp-b2', visit: '4–6 years', vaccine: 'DTwP / DTaP', dose: 5, doseLabel: 'Booster 2', due: y(4), catchUpBy: y(7), protects: 'Diphtheria, tetanus, pertussis', route: 'Intramuscular' },
  { key: 'ipv-b2', visit: '4–6 years', vaccine: 'IPV', dose: 5, doseLabel: 'Booster 2', due: y(4), catchUpBy: y(7), protects: 'Poliomyelitis', route: 'Intramuscular' },
  { key: 'mmr-3', visit: '4–6 years', vaccine: 'MMR', dose: 3, due: y(4), catchUpBy: y(7), protects: 'Measles, mumps, rubella', route: 'Subcutaneous' },
  { key: 'var-2', visit: '4–6 years', vaccine: 'Varicella', dose: 2, due: y(4), catchUpBy: y(7), protects: 'Chickenpox', route: 'Subcutaneous' },
];

export const SCHEDULE_BY_KEY = new Map(SCHEDULE.map((d) => [d.key, d]));

export const VISIT_ORDER = [...new Set(SCHEDULE.map((d) => d.visit))];

export const SOURCE = {
  name: 'IAP Advisory Committee on Vaccines and Immunization Practices (ACVIP) recommended schedule, 0–6 years',
  url: 'https://iapindia.org/',
  disclaimer:
    'Informational record-keeping only. Vaccine brands, combinations and timing vary — always follow the schedule your paediatrician gives you.',
};

/** Adds an offset expressed in weeks or months to a date, in UTC. */
export function addOffset(date, { unit, value }) {
  const d = new Date(date.getTime());
  if (unit === 'week') d.setUTCDate(d.getUTCDate() + value * 7);
  else d.setUTCMonth(d.getUTCMonth() + value);
  return d;
}

const DAY = 86_400_000;

/**
 * Merges the static schedule with what has actually been administered.
 *
 * Status is derived, never stored: `given` once a record exists, otherwise
 * `overdue` past the catch-up window, `due` once the due date has passed, and
 * `upcoming` before that. `dueSoon` marks the next 30 days so the dashboard can
 * nudge without crying wolf.
 */
export function buildImmunisationPlan({ dob, records = [], now = new Date() }) {
  const birth = new Date(dob);
  const given = new Map(records.map((r) => [r.vaccineKey, r]));

  const doses = SCHEDULE.map((d) => {
    const dueDate = addOffset(birth, d.due);
    const catchUpDate = addOffset(birth, d.catchUpBy);
    const record = given.get(d.key);

    let status;
    if (record) status = 'given';
    else if (now > catchUpDate) status = 'missed';
    else if (now > dueDate) status = 'overdue';
    else status = 'upcoming';

    const daysUntilDue = Math.round((dueDate - now) / DAY);

    return {
      ...d,
      doseLabel: d.doseLabel ?? `Dose ${d.dose}`,
      dueDate: dueDate.toISOString(),
      catchUpBy: catchUpDate.toISOString(),
      status,
      dueSoon: status === 'upcoming' && daysUntilDue <= 30,
      daysUntilDue,
      daysOverdue: status === 'overdue' || status === 'missed' ? Math.round((now - dueDate) / DAY) : 0,
      administeredAt: record?.administeredAt ?? null,
      note: record?.note ?? d.note ?? null,
    };
  });

  const counts = doses.reduce(
    (acc, d) => ({ ...acc, [d.status]: (acc[d.status] ?? 0) + 1 }),
    { given: 0, overdue: 0, missed: 0, upcoming: 0 },
  );

  // Coverage is measured against doses that are actually due by now — a
  // newborn is not "5% covered", they are fully covered for their age.
  const dueSoFar = doses.filter((d) => d.status !== 'upcoming').length;
  const coverage = dueSoFar === 0 ? 1 : counts.given / dueSoFar;

  const visits = VISIT_ORDER.map((visit) => {
    const items = doses.filter((d) => d.visit === visit);
    return {
      visit,
      dueDate: items[0].dueDate,
      status: items.every((i) => i.status === 'given')
        ? 'given'
        : items.some((i) => i.status === 'overdue' || i.status === 'missed')
          ? 'overdue'
          : items.some((i) => i.status === 'given')
            ? 'partial'
            : 'upcoming',
      doses: items,
    };
  });

  return {
    doses,
    visits,
    counts,
    coverage: Math.round(coverage * 1000) / 1000,
    nextDue: doses.find((d) => d.status === 'upcoming') ?? null,
    source: SOURCE,
  };
}
