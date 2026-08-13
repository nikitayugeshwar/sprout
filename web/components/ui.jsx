'use client';

import clsx from 'clsx';

/** Shared tone vocabulary — one place decides what "warning" looks like. */
export const TONES = {
  good: { chip: 'bg-leaf-100 text-leaf-700 border-leaf-200', dot: 'bg-leaf-400', bar: 'bg-leaf-400' },
  info: { chip: 'bg-sky-soft text-sky-strong border-sky-soft', dot: 'bg-sky-strong', bar: 'bg-sky-strong' },
  warning: { chip: 'bg-amber-soft text-amber-strong border-amber-soft', dot: 'bg-amber-strong', bar: 'bg-amber-strong' },
  critical: { chip: 'bg-berry-100 text-berry-500 border-berry-100', dot: 'bg-berry-400', bar: 'bg-berry-400' },
};

export function Card({ className, children, ...rest }) {
  return (
    <div className={clsx('card p-5', className)} {...rest}>
      {children}
    </div>
  );
}

export function Chip({ tone = 'info', children, className }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', TONES[tone]?.chip, className)}>
      {children}
    </span>
  );
}

export function Button({ variant = 'primary', className, as: As = 'button', ...rest }) {
  const styles = {
    primary: 'bg-leaf-500 text-white hover:bg-leaf-600 disabled:bg-leaf-300',
    secondary: 'bg-surface text-ink border border-line hover:bg-surface-sunk',
    ghost: 'text-ink-soft hover:bg-surface-sunk hover:text-ink',
    danger: 'text-berry-500 hover:bg-berry-100',
  }[variant];

  return (
    <As
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-70',
        styles,
        className,
      )}
      {...rest}
    />
  );
}

export function Field({ label, error, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink-soft">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
      {error && (
        <span className="mt-1 block text-xs font-medium text-berry-500" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

export function Input({ className, invalid, ...rest }) {
  return (
    <input
      className={clsx(
        'w-full rounded-xl border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint',
        'focus:border-leaf-400 focus:outline-none focus:ring-2 focus:ring-leaf-200',
        invalid ? 'border-berry-400' : 'border-line',
        className,
      )}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export function Alert({ tone = 'critical', children }) {
  if (!children) return null;
  return (
    <div className={clsx('rounded-xl border px-3.5 py-3 text-sm font-medium', TONES[tone]?.chip)} role="alert">
      {children}
    </div>
  );
}

/**
 * Progress bar with an accessible label — a bare coloured strip tells a screen
 * reader nothing.
 */
export function Meter({ value, max = 1, tone = 'good', label }) {
  const pct = Math.max(0, Math.min(1, max === 0 ? 0 : value / max)) * 100;
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-surface-sunk"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={clsx('h-full rounded-full transition-[width] duration-500', TONES[tone]?.bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={clsx('animate-pulse rounded-lg bg-surface-sunk', className)} />;
}

export function EmptyState({ title, body, action }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-12 text-center">
      <h3 className="font-display text-lg text-ink">{title}</h3>
      <p className="max-w-sm text-sm text-ink-soft">{body}</p>
      {action}
    </Card>
  );
}

/** 1 → "1st", 12 → "12th". Used everywhere percentiles are shown. */
export function ordinal(n) {
  const v = Math.round(n);
  if (v <= 0) return '<1st';
  if (v >= 100) return '99th+';
  const s = ['th', 'st', 'nd', 'rd'];
  const m = v % 100;
  return v + (s[(m - 20) % 10] ?? s[m] ?? s[0]);
}
