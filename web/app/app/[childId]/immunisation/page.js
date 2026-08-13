'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Check, Undo2 } from 'lucide-react';
import { children as childrenApi } from '../../../../lib/api';
import { LoadingBlock } from '../../../../components/AppShell';
import { Alert, Card, Chip, Meter } from '../../../../components/ui';

const STATUS = {
  given: { tone: 'good', label: 'Given' },
  overdue: { tone: 'warning', label: 'Overdue' },
  missed: { tone: 'critical', label: 'Past catch-up' },
  upcoming: { tone: 'info', label: 'Upcoming' },
};

const VISIT_STATUS = { given: 'good', overdue: 'warning', partial: 'info', upcoming: 'info' };

const fmt = (d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export default function ImmunisationPage() {
  const { childId } = useParams();
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(() => new Set());

  const load = useCallback(async () => {
    try {
      setPlan(await childrenApi.immunisation(childId));
    } catch (err) {
      setError(err.message);
    }
  }, [childId]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(dose) {
    if (pending.has(dose.key)) return;
    setPending((p) => new Set(p).add(dose.key));
    try {
      if (dose.status === 'given') {
        await childrenApi.clearDose(childId, dose.key);
      } else {
        // Default to today — a parent recording a dose is almost always doing
        // it on the day, and the date stays editable through the API.
        await childrenApi.setDose(childId, dose.key, { administeredAt: new Date().toISOString() });
      }
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(dose.key);
        return n;
      });
    }
  }

  if (error && !plan) return <Alert>{error}</Alert>;
  if (!plan) return <LoadingBlock label="Building the schedule" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl tracking-tight text-ink">Immunisation</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Generated from your child&apos;s date of birth using the {plan.source.name}.
        </p>
      </div>

      {error && <Alert>{error}</Alert>}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="tabular font-display text-3xl text-ink">{Math.round(plan.coverage * 100)}%</p>
            <p className="mt-0.5 text-sm text-ink-soft">of the doses due so far are recorded</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip tone="good">{plan.counts.given} given</Chip>
            {plan.counts.overdue > 0 && <Chip tone="warning">{plan.counts.overdue} overdue</Chip>}
            {plan.counts.missed > 0 && <Chip tone="critical">{plan.counts.missed} past catch-up</Chip>}
            <Chip tone="info">{plan.counts.upcoming} upcoming</Chip>
          </div>
        </div>
        <div className="mt-4">
          <Meter value={plan.coverage} tone={plan.coverage >= 1 ? 'good' : plan.coverage >= 0.8 ? 'warning' : 'critical'} label={`Coverage ${Math.round(plan.coverage * 100)}%`} />
        </div>
      </Card>

      <ol className="space-y-4">
        {plan.visits.map((visit) => (
          <li key={visit.visit}>
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                <div>
                  <h2 className="font-display text-lg text-ink">{visit.visit}</h2>
                  <p className="tabular mt-0.5 text-xs text-ink-faint">due {fmt(visit.dueDate)}</p>
                </div>
                <Chip tone={VISIT_STATUS[visit.status]}>
                  {visit.status === 'given' ? 'Complete' : visit.status === 'overdue' ? 'Needs attention' : visit.status === 'partial' ? 'Partly done' : 'Upcoming'}
                </Chip>
              </div>

              <ul className="mt-1 divide-y divide-line/60">
                {visit.doses.map((dose) => {
                  const s = STATUS[dose.status];
                  const given = dose.status === 'given';
                  return (
                    <li key={dose.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-ink">{dose.vaccine}</span>
                          <span className="text-xs text-ink-faint">{dose.doseLabel}</span>
                          <Chip tone={s.tone}>{s.label}</Chip>
                        </div>
                        <p className="mt-1 text-xs text-ink-soft">
                          {dose.protects}
                          {given && dose.administeredAt && <> · given {fmt(dose.administeredAt)}</>}
                          {!given && dose.status !== 'upcoming' && <> · {dose.daysOverdue} days late, catch up by {fmt(dose.catchUpBy)}</>}
                          {!given && dose.status === 'upcoming' && <> · due in {dose.daysUntilDue} days</>}
                        </p>
                        {dose.note && <p className="mt-1 text-xs italic text-ink-faint">{dose.note}</p>}
                      </div>

                      <button
                        type="button"
                        onClick={() => toggle(dose)}
                        disabled={pending.has(dose.key)}
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-60 ${
                          given ? 'border-line text-ink-faint hover:bg-surface-sunk' : 'border-leaf-300 bg-leaf-50 text-leaf-700 hover:bg-leaf-100'
                        }`}
                      >
                        {given ? (
                          <>
                            <Undo2 size={14} aria-hidden="true" /> Undo
                          </>
                        ) : (
                          <>
                            <Check size={14} aria-hidden="true" /> Mark given
                          </>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </li>
        ))}
      </ol>

      <p className="border-t border-line pt-6 text-xs leading-relaxed text-ink-faint">{plan.source.disclaimer}</p>
    </div>
  );
}
