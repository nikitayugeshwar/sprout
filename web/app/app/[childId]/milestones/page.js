'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Check } from 'lucide-react';
import { children as childrenApi } from '../../../../lib/api';
import { LoadingBlock } from '../../../../components/AppShell';
import { Alert, Card, Chip, Meter } from '../../../../components/ui';

export default function MilestonesPage() {
  const { childId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [active, setActive] = useState(null);
  // Keys currently in flight, so a double-click cannot fire two writes.
  const [pending, setPending] = useState(() => new Set());

  const load = useCallback(async () => {
    try {
      const r = await childrenApi.milestones(childId);
      setData(r);
      setActive((current) => {
        if (current != null) return current;
        // Open on the checkpoint the child is actually working through.
        const inProgress = r.checkpoints.filter((c) => c.status === 'in-progress');
        return (inProgress.at(-1) ?? r.checkpoints[0]).months;
      });
    } catch (err) {
      setError(err.message);
    }
  }, [childId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = useCallback(
    async (item) => {
      if (pending.has(item.key)) return;
      const next = item.status === 'achieved' ? 'not_yet' : 'achieved';

      setPending((p) => new Set(p).add(item.key));
      // Optimistic: ticking a checkbox should feel instant, and we reconcile
      // with the server response immediately afterwards.
      setData((d) => ({ ...d, items: d.items.map((i) => (i.key === item.key ? { ...i, status: next, overdue: next === 'achieved' ? false : i.overdue } : i)) }));

      try {
        await childrenApi.setMilestone(childId, item.key, { status: next });
        await load();
      } catch (err) {
        setError(err.message);
        await load();
      } finally {
        setPending((p) => {
          const n = new Set(p);
          n.delete(item.key);
          return n;
        });
      }
    },
    [childId, load, pending],
  );

  const byDomain = useMemo(() => {
    if (!data || active == null) return [];
    return data.domains.map((d) => ({
      ...d,
      items: data.items.filter((i) => i.months === active && i.domain === d.key),
    }));
  }, [data, active]);

  if (error && !data) return <Alert>{error}</Alert>;
  if (!data) return <LoadingBlock label="Loading milestones" />;

  const checkpoint = data.checkpoints.find((c) => c.months === active);
  const totalAchieved = data.items.filter((i) => i.status === 'achieved').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl tracking-tight text-ink">Milestones</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
          {data.source.name}. Each item is set at roughly the age by which most children can do it — a blank box is a prompt to
          mention it at the next visit, not a verdict.
        </p>
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Age checkpoint">
        {data.checkpoints.map((c) => {
          const isActive = c.months === active;
          return (
            <button
              key={c.months}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(c.months)}
              disabled={c.status === 'upcoming'}
              className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                isActive ? 'border-leaf-400 bg-leaf-100 text-leaf-700' : 'border-line bg-surface text-ink-soft hover:bg-surface-sunk'
              }`}
            >
              {c.months}m
              <span className="tabular ml-1.5 text-xs font-medium opacity-70">
                {c.achieved}/{c.total}
              </span>
            </button>
          );
        })}
      </div>

      {checkpoint && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg text-ink">The {checkpoint.months}-month checklist</h2>
            <Chip tone={checkpoint.status === 'complete' ? 'good' : checkpoint.status === 'upcoming' ? 'info' : 'warning'}>
              {checkpoint.achieved} of {checkpoint.total} ticked
            </Chip>
          </div>
          <div className="mt-3">
            <Meter value={checkpoint.achieved} max={checkpoint.total} tone={checkpoint.status === 'complete' ? 'good' : 'info'} label={`${checkpoint.achieved} of ${checkpoint.total} ticked`} />
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {byDomain.map((domain) => (
          <Card key={domain.key}>
            <h3 className="font-display text-base text-ink">{domain.label}</h3>
            <p className="mt-0.5 text-xs text-ink-faint">{domain.blurb}</p>

            <ul className="mt-4 space-y-1.5">
              {domain.items.map((item) => {
                const achieved = item.status === 'achieved';
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => toggle(item)}
                      aria-pressed={achieved}
                      disabled={pending.has(item.key)}
                      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                        achieved
                          ? 'border-leaf-200 bg-leaf-50'
                          : item.overdue
                            ? 'border-amber-soft bg-amber-soft/40 hover:bg-amber-soft/70'
                            : 'border-line bg-surface hover:bg-surface-sunk'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                          achieved ? 'border-leaf-500 bg-leaf-500 text-white' : 'border-line bg-surface'
                        }`}
                      >
                        {achieved && <Check size={13} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm leading-snug ${achieved ? 'text-ink-soft' : 'text-ink'}`}>{item.text}</span>
                        {item.overdue && !achieved && (
                          <span className="mt-1 block text-xs font-semibold text-amber-strong">Past its checkpoint</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>

      <p className="border-t border-line pt-6 text-xs leading-relaxed text-ink-faint">
        {totalAchieved} of {data.items.length} milestones ticked overall. Source: {data.source.citation}. Children develop at
        different rates; if something here worries you, the right next step is a conversation with your paediatrician.
      </p>
    </div>
  );
}
