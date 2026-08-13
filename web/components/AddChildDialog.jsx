'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { children as childrenApi, ApiError } from '../lib/api';
import { Alert, Button, Field, Input } from './ui';

/**
 * Minimal modal. Native <dialog> gives us focus trapping, Escape-to-close and
 * the top layer for free — reimplementing that in userland is how accessibility
 * bugs get shipped.
 */
export function Modal({ title, onClose, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // Clicking the backdrop (the dialog element itself, not its contents).
        if (e.target === ref.current) ref.current.close();
      }}
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="font-display text-lg">{title}</h2>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-surface-sunk hover:text-ink"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  );
}

export function AddChildDialog({ onClose, onCreated }) {
  const [values, setValues] = useState({ name: '', sex: '', dob: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const r = await childrenApi.create(values);
      onCreated(r.child);
    } catch (err) {
      if (err instanceof ApiError && err.details) setFieldErrors(err.fieldErrors);
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Add a child" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Name" error={fieldErrors.name}>
          <Input value={values.name} onChange={set('name')} invalid={Boolean(fieldErrors.name)} placeholder="Aarav" autoFocus />
        </Field>

        <Field label="Date of birth" error={fieldErrors.dob}>
          <Input type="date" value={values.dob} onChange={set('dob')} invalid={Boolean(fieldErrors.dob)} max={new Date().toISOString().slice(0, 10)} />
        </Field>

        <Field
          label="Sex"
          error={fieldErrors.sex}
          hint="Every WHO growth standard is published separately for boys and girls, so this is needed to score a measurement at all."
        >
          <div className="flex gap-2">
            {[
              ['female', 'Girl'],
              ['male', 'Boy'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setValues((v) => ({ ...v, sex: value }))}
                aria-pressed={values.sex === value}
                className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
                  values.sex === value ? 'border-leaf-400 bg-leaf-100 text-leaf-700' : 'border-line bg-surface text-ink-soft hover:bg-surface-sunk'
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
            Add child
          </Button>
        </div>
      </form>
    </Modal>
  );
}
