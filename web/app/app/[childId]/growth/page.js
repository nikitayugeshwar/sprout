'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { children as childrenApi } from '../../../../lib/api';
import { LoadingBlock } from '../../../../components/AppShell';
import { GrowthChart } from '../../../../components/GrowthChart';
import { AddMeasurementDialog } from '../../../../components/AddMeasurementDialog';
import { Alert, Button, Card, Chip, EmptyState, ordinal } from '../../../../components/ui';

const INDICATORS = [
  ['wfa', 'Weight'],
  ['lhfa', 'Height'],
  ['bfa', 'BMI'],
  ['hcfa', 'Head'],
];

export default function GrowthPage() {
  const { childId } = useParams();
  const [indicator, setIndicator] = useState('wfa');
  const [child, setChild] = useState(null);
  const [chart, setChart] = useState(null);
  const [measurements, setMeasurements] = useState(null);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, g, m] = await Promise.all([
        childrenApi.get(childId),
        childrenApi.growth(childId, indicator),
        childrenApi.measurements(childId),
      ]);
      setChild(c.child);
      setChart(g);
      setMeasurements(m.measurements);
    } catch (err) {
      setError(err.message);
    }
  }, [childId, indicator]);

  useEffect(() => {
    setChart(null);
    setError(null);
    load();
  }, [load]);

  async function remove(id) {
    await childrenApi.deleteMeasurement(childId, id);
    await load();
  }

  if (error) return <Alert>{error}</Alert>;
  if (!chart || !child) return <LoadingBlock label="Loading charts" />;

  const latest = chart.points.at(-1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-ink">Growth</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {child.name} plotted against the WHO Child Growth Standards for {child.sex === 'male' ? 'boys' : 'girls'}.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus size={16} aria-hidden="true" /> Add measurement
        </Button>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Growth indicator">
        {INDICATORS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={indicator === key}
            onClick={() => setIndicator(key)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
              indicator === key ? 'border-leaf-400 bg-leaf-100 text-leaf-700' : 'border-line bg-surface text-ink-soft hover:bg-surface-sunk'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {chart.points.length === 0 ? (
        <EmptyState
          title="Nothing to plot yet"
          body={`Add a measurement with ${indicator === 'hcfa' ? 'a head circumference' : indicator === 'bfa' ? 'both a weight and a height' : 'a value for this indicator'} and it will appear here against the reference curves.`}
          action={<Button onClick={() => setAdding(true)}>Add measurement</Button>}
        />
      ) : (
        <>
          <Card>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-display text-lg text-ink">{chart.reference.label}</h2>
              {latest && (
                <div className="flex items-center gap-2">
                  <span className="tabular text-sm text-ink-soft">
                    latest {latest.value} {chart.reference.unit}
                  </span>
                  <Chip tone={latest.tone}>{ordinal(latest.percentile)} percentile</Chip>
                </div>
              )}
            </div>

            <GrowthChart reference={chart.reference} points={chart.points} childName={child.name} />

            <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-ink-faint">
              Reference data: {chart.reference.standard}. Values are interpolated between WHO&apos;s daily LMS rows and converted
              to z-scores with the Box-Cox transform, applying WHO&apos;s extreme-value correction beyond ±3 SD for weight-based
              indicators.
            </p>
          </Card>

          <Card>
            <h2 className="font-display text-lg text-ink">Every reading</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                    <th className="pb-2 pr-4 font-semibold">Date</th>
                    <th className="pb-2 pr-4 font-semibold">Age</th>
                    <th className="pb-2 pr-4 font-semibold">Weight</th>
                    <th className="pb-2 pr-4 font-semibold">Height</th>
                    <th className="pb-2 pr-4 font-semibold">Head</th>
                    <th className="pb-2 pr-4 font-semibold">Where</th>
                    <th className="pb-2 font-semibold sr-only">Actions</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {measurements?.map((m) => (
                    <tr key={m.id} className="border-b border-line/60 last:border-0">
                      <td className="py-2.5 pr-4 text-ink">
                        {new Date(m.takenAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="py-2.5 pr-4 text-ink-soft">{m.ageMonths}m</td>
                      <td className="py-2.5 pr-4 text-ink-soft">{m.weightKg ? `${m.weightKg} kg` : '—'}</td>
                      <td className="py-2.5 pr-4 text-ink-soft">{m.heightCm ? `${m.heightCm} cm` : '—'}</td>
                      <td className="py-2.5 pr-4 text-ink-soft">{m.headCircumferenceCm ? `${m.headCircumferenceCm} cm` : '—'}</td>
                      <td className="py-2.5 pr-4 text-ink-faint">{m.source === 'clinic' ? 'Clinic' : 'Home'}</td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => remove(m.id)}
                          className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-berry-100 hover:text-berry-500"
                          aria-label={`Delete measurement from ${new Date(m.takenAt).toLocaleDateString()}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

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
