'use client';

import { useMemo, useState, useId } from 'react';
import { ordinal } from './ui';

const W = 840;
const H = 460;
const M = { top: 18, right: 18, bottom: 40, left: 52 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

/**
 * Bands are drawn outside-in with increasing opacity, so the healthy middle of
 * the distribution reads as the "normal" zone at a glance without needing a
 * legend. ±2 SD gets a dashed rule because that is the line clinicians actually
 * act on.
 */
const BANDS = [
  { from: -3, to: -2, opacity: 0.3 },
  { from: -2, to: -1, opacity: 0.55 },
  { from: -1, to: 1, opacity: 0.9 },
  { from: 1, to: 2, opacity: 0.55 },
  { from: 2, to: 3, opacity: 0.3 },
];

const DOT_FILL = {
  good: 'var(--color-leaf-500)',
  info: 'var(--color-sky-strong)',
  warning: 'var(--color-amber-strong)',
  critical: 'var(--color-berry-400)',
};

/** Round tick values to something a human would choose. */
function niceTicks(min, max, count) {
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const start = Math.ceil(min / step) * step;

  const ticks = [];
  for (let v = start; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

function monthTicks(maxMonths) {
  const step = maxMonths <= 6 ? 1 : maxMonths <= 15 ? 3 : maxMonths <= 30 ? 6 : 12;
  const ticks = [];
  for (let v = 0; v <= maxMonths + 1e-9; v += step) ticks.push(v);
  return ticks;
}

export function GrowthChart({ reference, points, childName }) {
  const [hover, setHover] = useState(null);
  const clipId = useId();

  const model = useMemo(() => {
    if (!reference?.ageMonths?.length) return null;

    const ages = reference.ageMonths;
    const maxAge = ages[ages.length - 1];

    const lower = reference.curves['-3'] ?? reference.curves[-3] ?? [];
    const upper = reference.curves['3'] ?? reference.curves[3] ?? [];

    // The y-domain has to hold the reference envelope *and* the child, or a
    // reading outside the standards would be silently clipped off the canvas.
    const values = [...lower, ...upper, ...points.map((p) => p.value)].filter(Number.isFinite);
    let yMin = Math.min(...values);
    let yMax = Math.max(...values);
    const pad = (yMax - yMin) * 0.06 || 1;
    yMin -= pad;
    yMax += pad;

    const x = (months) => M.left + (months / maxAge) * PLOT_W;
    const y = (value) => M.top + PLOT_H - ((value - yMin) / (yMax - yMin)) * PLOT_H;

    const line = (series) => series.map((v, i) => `${i ? 'L' : 'M'}${x(ages[i]).toFixed(2)},${y(v).toFixed(2)}`).join('');

    const band = ({ from, to }) => {
      const a = reference.curves[String(from)] ?? [];
      const b = reference.curves[String(to)] ?? [];
      if (!a.length || !b.length) return null;
      const down = a.map((v, i) => `${i ? 'L' : 'M'}${x(ages[i]).toFixed(2)},${y(v).toFixed(2)}`).join('');
      const back = b
        .map((v, i) => ({ v, i }))
        .reverse()
        .map(({ v, i }) => `L${x(ages[i]).toFixed(2)},${y(v).toFixed(2)}`)
        .join('');
      return `${down}${back}Z`;
    };

    return {
      x,
      y,
      maxAge,
      yMin,
      yMax,
      line,
      band,
      childPath: points.length ? points.map((p, i) => `${i ? 'L' : 'M'}${x(p.ageMonths).toFixed(2)},${y(p.value).toFixed(2)}`).join('') : null,
      yTicks: niceTicks(yMin, yMax, 8),
      xTicks: monthTicks(maxAge),
    };
  }, [reference, points]);

  if (!model) return null;

  const unit = reference.unit;

  return (
    <figure className="m-0">
      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ aspectRatio: `${W} / ${H}` }}
          role="img"
          aria-label={`${reference.label} chart for ${childName}. ${points.length} measurements plotted against WHO percentile bands.`}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={M.left} y={M.top} width={PLOT_W} height={PLOT_H} />
            </clipPath>
          </defs>

          <g clipPath={`url(#${clipId})`}>
            {BANDS.map((b) => {
              const d = model.band(b);
              return d ? <path key={`${b.from}:${b.to}`} d={d} fill="var(--color-leaf-200)" opacity={b.opacity} /> : null;
            })}
          </g>

          {/* Horizontal grid + y-axis labels */}
          {model.yTicks.map((t) => (
            <g key={`y${t}`}>
              <line x1={M.left} x2={W - M.right} y1={model.y(t)} y2={model.y(t)} stroke="var(--color-line)" strokeWidth="1" opacity="0.7" />
              <text x={M.left - 10} y={model.y(t)} textAnchor="end" dominantBaseline="middle" className="tabular" fill="var(--color-ink-faint)" fontSize="13">
                {t}
              </text>
            </g>
          ))}

          {/* ±2 SD — the thresholds that actually trigger a clinical conversation */}
          {['-2', '2'].map((z) => {
            const c = reference.curves[z];
            return c ? <path key={z} d={model.line(c)} fill="none" stroke="var(--color-amber-strong)" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.65" /> : null;
          })}

          {/* Median */}
          {reference.curves['0'] && (
            <path d={model.line(reference.curves['0'])} fill="none" stroke="var(--color-leaf-500)" strokeWidth="2" opacity="0.75" />
          )}

          {/* x-axis */}
          <line x1={M.left} x2={W - M.right} y1={M.top + PLOT_H} y2={M.top + PLOT_H} stroke="var(--color-line)" strokeWidth="1.5" />
          {model.xTicks.map((t) => (
            <text key={`x${t}`} x={model.x(t)} y={H - 14} textAnchor="middle" className="tabular" fill="var(--color-ink-faint)" fontSize="13">
              {t}
            </text>
          ))}
          <text x={M.left} y={H - 1} textAnchor="start" fill="var(--color-ink-faint)" fontSize="11">
            age in months
          </text>

          {/* The child's own trajectory */}
          {model.childPath && (
            <path d={model.childPath} fill="none" stroke="var(--color-ink)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
          )}

          {points.map((p, i) => {
            const active = hover?.id === p.id;
            return (
              <g key={p.id || i}>
                <circle
                  cx={model.x(p.ageMonths)}
                  cy={model.y(p.value)}
                  r={active ? 8 : 5.5}
                  fill="var(--color-surface)"
                  stroke={DOT_FILL[p.tone] ?? DOT_FILL.good}
                  strokeWidth="3"
                  pointerEvents="none"
                />
                {/*
                 * Generous invisible hit area — a 5.5px dot is too small to aim
                 * at, especially on a touchscreen. It must come *after* the
                 * visible dot so it sits on top: SVG has no z-index, so a
                 * hit target painted first is simply covered up.
                 */}
                <circle
                  cx={model.x(p.ageMonths)}
                  cy={model.y(p.value)}
                  r="18"
                  fill="transparent"
                  onMouseEnter={() => setHover(p)}
                  onFocus={() => setHover(p)}
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                  role="button"
                  aria-label={`${p.value} ${unit} at ${p.ageMonths.toFixed(1)} months, ${ordinal(p.percentile)} percentile`}
                  className="cursor-pointer outline-none"
                />
              </g>
            );
          })}
        </svg>

        {hover && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg"
            style={{ left: `${(model.x(hover.ageMonths) / W) * 100}%`, top: `${((model.y(hover.value) - 14) / H) * 100}%` }}
          >
            <div className="tabular font-display text-sm font-semibold text-ink">
              {hover.value} {unit}
            </div>
            <div className="tabular mt-0.5 text-ink-soft">
              {ordinal(hover.percentile)} percentile · z {hover.z > 0 ? '+' : ''}
              {hover.z.toFixed(2)}
            </div>
            <div className="tabular mt-0.5 text-ink-faint">
              {hover.ageMonths.toFixed(1)} months · {new Date(hover.takenAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
            {hover.delta != null && (
              <div className="tabular mt-0.5 text-ink-faint">
                {hover.delta > 0 ? '+' : ''}
                {hover.delta.toFixed(2)} SD since last visit
              </div>
            )}
          </div>
        )}
      </div>

      <figcaption className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-sm bg-leaf-200" /> WHO 3rd–97th percentile
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="20" height="8" aria-hidden="true">
            <line x1="0" y1="4" x2="20" y2="4" stroke="var(--color-leaf-500)" strokeWidth="2" />
          </svg>
          median
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="20" height="8" aria-hidden="true">
            <line x1="0" y1="4" x2="20" y2="4" stroke="var(--color-amber-strong)" strokeWidth="1.5" strokeDasharray="5 4" />
          </svg>
          ±2 SD
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="14" height="14" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" fill="var(--color-surface)" stroke="var(--color-leaf-500)" strokeWidth="2.5" />
          </svg>
          {childName}
        </span>
      </figcaption>
    </figure>
  );
}
