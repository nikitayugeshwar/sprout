'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Plus, ArrowRight, Syringe, ListChecks } from 'lucide-react';
import { children as childrenApi } from '../../../lib/api';
import { LoadingBlock } from '../../../components/AppShell';
import { Card, Chip, Button, Meter, Alert, ordinal, TONES } from '../../../components/ui';
import { AddMeasurementDialog } from '../../../components/AddMeasurementDialog';

const SEVERITY_TONE = { high: 'critical', medium: 'warning', low: 'info' };

function InsightCard({ insight }) {
  const tone = insight.tone === 'good' ? 'good' : SEVERITY_TONE[insight.severity];
  const e = insight.evidence;

  return (
    <Card className="rise">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-base leading-snug text-ink">{insight.title}</h3>
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${TONES[tone]?.dot}`} aria-hidden="true" />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{insight.body}</p>

      {e?.z != null && (
        <dl className="tabular mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3 text-xs text-ink-faint">
          <div>
            <dt className="inline">z-score </dt>
            <dd className="inline font-semibold text-ink-soft">
              {e.z > 0 ? '+' : ''}
              {e.z.toFixed(2)}
            </dd>
          </div>
          <div>
            <dt className="inline">percentile </dt>
            <dd className="inline font-semibold text-ink-soft">{ordinal(e.percentile)}</dd>
          </div>
          {e.drift != null && (
            <div>
              <dt className="inline">drift </dt>
              <dd className="inline font-semibold text-ink-soft">
                {e.drift > 0 ? '+' : ''}
                {e.drift.toFixed(2)} SD over {e.readings} readings
              </dd>
            </div>
          )}
        </dl>
      )}

      {insight.action && <p className="mt-3 text-xs font-semibold text-leaf-600">{insight.action}</p>}
    </Card>
  );
}

function IndicatorTile({ result, drift }) {
  const tone = result.tone === 'good' ? 'good' : result.tone;
  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{result.label}</span>
      </div>
      <div className="tabular mt-2 font-display text-2xl text-ink">
        {result.value}
        <span className="ml-1 text-sm font-normal text-ink-faint">{result.unit}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Chip tone={tone}>{ordinal(result.percentile)} pct</Chip>
        <span className="tabular text-xs text-ink-faint">
          z {result.z > 0 ? '+' : ''}
          {result.z.toFixed(2)}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-soft">{result.classificationLabel}</p>
      {drift != null && Math.abs(drift) >= 0.67 && (
        <p className={`tabular mt-1.5 text-xs font-semibold ${drift < 0 ? 'text-amber-strong' : 'text-sky-strong'}`}>
          {drift > 0 ? '↑' : '↓'} {Math.abs(drift).toFixed(2)} SD since first reading
        </p>
      )}
    </Card>
  );
}

export default function OverviewPage() {
  const { childId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await childrenApi.overview(childId));
    } catch (err) {
      setError(err.message);
    }
  }, [childId]);

  useEffect(() => {
    setData(null);
    setError(null);
    load();
  }, [load]);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <LoadingBlock />;

  const { child, insights, growth, milestones, immunisation } = data;
  const results = growth.latest?.results ?? {};

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-ink">{child.name}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {child.ageLabel} old · born {new Date(child.dob).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
            {growth.takenAt && <> · last measured {new Date(growth.takenAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</>}
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus size={16} aria-hidden="true" /> Add measurement
        </Button>
      </div>

      {!child.withinGrowthStandards && (
        <Alert tone="info">
          {child.name} is past five years old. The WHO Child Growth Standards stop at 1856 days, so growth percentiles are no
          longer calculated — milestones and immunisation still are.
        </Alert>
      )}

      {/* What needs attention */}
      <section>
        <h2 className="mb-3 font-display text-lg text-ink">What to look at</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {insights.map((i) => (
            <InsightCard key={i.id} insight={i} />
          ))}
        </div>
      </section>

      {/* Latest measurements */}
      {Object.keys(results).length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg text-ink">Latest measurements</h2>
            <Link href={`/app/${childId}/growth`} className="inline-flex items-center gap-1 text-sm font-semibold text-leaf-600 hover:underline">
              Growth charts <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {['wfa', 'lhfa', 'bfa', 'hcfa'].map((key) =>
              results[key] ? <IndicatorTile key={key} result={results[key]} drift={growth.trends[key]?.drift} /> : null,
            )}
          </div>
          <p className="mt-3 text-xs text-ink-faint">
            Scored against the WHO Child Growth Standards (2006) from {growth.measurementCount} recorded{' '}
            {growth.measurementCount === 1 ? 'measurement' : 'measurements'}.
          </p>
        </section>
      )}

      {/* Milestones + vaccines summary */}
      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-lg text-ink">
              <ListChecks size={18} className="text-leaf-500" aria-hidden="true" /> Milestones
            </h2>
            <Link href={`/app/${childId}/milestones`} className="text-sm font-semibold text-leaf-600 hover:underline">
              Open
            </Link>
          </div>

          <p className="tabular mt-3 font-display text-2xl text-ink">
            {milestones.achieved}
            <span className="text-base font-normal text-ink-faint"> / {milestones.expected} due so far</span>
          </p>

          <div className="mt-4 space-y-3">
            {milestones.byDomain.map((d) => (
              <div key={d.key}>
                <div className="mb-1 flex items-baseline justify-between text-xs">
                  <span className="font-semibold text-ink-soft">{d.label}</span>
                  <span className="tabular text-ink-faint">
                    {d.achieved}/{d.expected}
                  </span>
                </div>
                <Meter value={d.achieved} max={d.expected} label={`${d.label}: ${d.achieved} of ${d.expected}`} tone={d.achieved === d.expected ? 'good' : 'info'} />
              </div>
            ))}
          </div>

          {milestones.overdue > 0 && (
            <p className="mt-4 text-xs font-semibold text-amber-strong">
              {milestones.overdue} past their checkpoint and not yet ticked
            </p>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-lg text-ink">
              <Syringe size={18} className="text-leaf-500" aria-hidden="true" /> Immunisation
            </h2>
            <Link href={`/app/${childId}/immunisation`} className="text-sm font-semibold text-leaf-600 hover:underline">
              Open
            </Link>
          </div>

          <p className="tabular mt-3 font-display text-2xl text-ink">
            {Math.round(immunisation.coverage * 100)}%
            <span className="text-base font-normal text-ink-faint"> of doses due so far</span>
          </p>
          <div className="mt-3">
            <Meter
              value={immunisation.coverage}
              tone={immunisation.coverage >= 1 ? 'good' : immunisation.coverage >= 0.8 ? 'warning' : 'critical'}
              label={`Immunisation coverage ${Math.round(immunisation.coverage * 100)}%`}
            />
          </div>

          {immunisation.overdue.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {immunisation.overdue.map((d) => (
                <li key={d.key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink-soft">
                    {d.vaccine} <span className="text-ink-faint">{d.doseLabel}</span>
                  </span>
                  <Chip tone={d.status === 'missed' ? 'critical' : 'warning'}>{d.daysOverdue}d late</Chip>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-ink-soft">
              Nothing outstanding.
              {immunisation.nextDue && (
                <>
                  {' '}
                  Next is the {immunisation.nextDue.visit} visit on{' '}
                  {new Date(immunisation.nextDue.dueDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}.
                </>
              )}
            </p>
          )}
        </Card>
      </section>

      <p className="border-t border-line pt-6 text-xs leading-relaxed text-ink-faint">
        Sprout does not diagnose. Percentiles and flags are calculated from published reference data to help you have a better
        conversation with your paediatrician — not to replace one.
      </p>

      {adding && (
        <AddMeasurementDialog
          childId={childId}
          childName={child.name}
          onClose={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await load();
          }}
        />
      )}
    </div>
  );
}
