'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { children as childrenApi, ApiError } from '../lib/api';
import { Alert, Button, Field, Input, Chip, ordinal } from './ui';
import { Modal } from './AddChildDialog';

const today = () => new Date().toISOString().slice(0, 10);

export function AddMeasurementDialog({ childId, childName, onClose, onSaved }) {
  const [values, setValues] = useState({ takenAt: today(), weightKg: '', heightCm: '', headCircumferenceCm: '', source: 'parent' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null);

  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    // Blank inputs are omitted rather than sent as empty strings — a parent who
    // only weighed the baby should not be forced to invent a height.
    const body = { takenAt: values.takenAt, source: values.source };
    for (const key of ['weightKg', 'heightCm', 'headCircumferenceCm']) {
      if (values[key] !== '') body[key] = Number(values[key]);
    }

    try {
      const r = await childrenApi.addMeasurement(childId, body);
      // Show the scored result before closing — the instant percentile is the
      // whole reason someone bothers to type this in.
      setSaved(r.measurement);
      setBusy(false);
    } catch (err) {
      if (err instanceof ApiError && err.details) setFieldErrors(err.fieldErrors);
      setError(err.message);
      setBusy(false);
    }
  }

  if (saved) {
    const results = Object.values(saved.results ?? {});
    return (
      <Modal title="Measurement saved" onClose={onSaved}>
        <p className="text-sm text-ink-soft">
          Scored against the WHO standards for {childName} at {saved.ageMonths} months.
        </p>

        {results.length ? (
          <ul className="mt-4 space-y-2">
            {results.map((r) => (
              <li key={r.indicator} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5">
                <div>
                  <div className="text-sm font-semibold text-ink">{r.label}</div>
                  <div className="tabular text-xs text-ink-faint">
                    {r.value} {r.unit} · z {r.z > 0 ? '+' : ''}
                    {r.z.toFixed(2)}
                  </div>
                </div>
                <Chip tone={r.tone}>{ordinal(r.percentile)} pct</Chip>
              </li>
            ))}
          </ul>
        ) : (
          <Alert tone="info">
            This measurement is outside the age range covered by the WHO standards, so no percentile could be calculated. It has
            still been saved.
          </Alert>
        )}

        <div className="mt-5 flex justify-end">
          <Button onClick={onSaved}>Done</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`New measurement for ${childName}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Date measured" error={fieldErrors.takenAt}>
          <Input type="date" value={values.takenAt} onChange={set('takenAt')} max={today()} invalid={Boolean(fieldErrors.takenAt)} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Weight (kg)" error={fieldErrors.weightKg}>
            <Input type="number" step="0.01" inputMode="decimal" value={values.weightKg} onChange={set('weightKg')} placeholder="7.4" invalid={Boolean(fieldErrors.weightKg)} autoFocus />
          </Field>
          <Field label="Height / length (cm)" error={fieldErrors.heightCm}>
            <Input type="number" step="0.1" inputMode="decimal" value={values.heightCm} onChange={set('heightCm')} placeholder="68.5" invalid={Boolean(fieldErrors.heightCm)} />
          </Field>
        </div>

        <Field label="Head circumference (cm)" error={fieldErrors.headCircumferenceCm} hint="Optional — usually measured at clinic visits in the first two years.">
          <Input type="number" step="0.1" inputMode="decimal" value={values.headCircumferenceCm} onChange={set('headCircumferenceCm')} placeholder="43.2" invalid={Boolean(fieldErrors.headCircumferenceCm)} />
        </Field>

        <Field label="Measured by">
          <div className="flex gap-2">
            {[
              ['parent', 'At home'],
              ['clinic', 'At a clinic'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setValues((v) => ({ ...v, source: value }))}
                aria-pressed={values.source === value}
                className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
                  values.source === value ? 'border-leaf-400 bg-leaf-100 text-leaf-700' : 'border-line bg-surface text-ink-soft hover:bg-surface-sunk'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        {error && <Alert>{error}</Alert>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
            Save measurement
          </Button>
        </div>
      </form>
    </Modal>
  );
}
