'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { LogOut, Plus, Loader2 } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { SproutMark } from './Landing';
import { children as childrenApi } from '../lib/api';
import { Skeleton } from './ui';
import { AddChildDialog } from './AddChildDialog';

const ChildrenContext = createContext(null);
export const useChildren = () => useContext(ChildrenContext);

const TABS = [
  ['', 'Overview'],
  ['/growth', 'Growth'],
  ['/milestones', 'Milestones'],
  ['/immunisation', 'Vaccines'],
];

export function AppShell({ children }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();

  const [list, setList] = useState(null);
  const [adding, setAdding] = useState(false);

  const activeChildId = params?.childId ?? null;

  const refresh = useCallback(async () => {
    const r = await childrenApi.list();
    setList(r.children);
    return r.children;
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    refresh().catch(() => setList([]));
  }, [user, loading, router, refresh]);

  if (loading || !user) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="mt-6 h-64 w-full" />
      </div>
    );
  }

  const base = activeChildId ? `/app/${activeChildId}` : null;

  return (
    <ChildrenContext.Provider value={{ list, refresh }}>
      <div className="min-h-screen">
        <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
            <SproutMark href="/app" />

            <div className="flex items-center gap-2">
              {user.isDemo && (
                <span className="hidden rounded-full border border-leaf-200 bg-leaf-50 px-3 py-1.5 text-xs font-semibold text-leaf-700 sm:inline">
                  Demo account
                </span>
              )}
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface-sunk hover:text-ink"
              >
                <LogOut size={15} aria-hidden="true" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </div>

          {/* Child switcher */}
          <div className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto px-6 pb-3">
            {list === null ? (
              <Skeleton className="h-9 w-32" />
            ) : (
              <>
                {list.map((c) => {
                  const active = c.id === activeChildId;
                  return (
                    <Link
                      key={c.id}
                      href={`/app/${c.id}`}
                      className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                        active ? 'border-leaf-400 bg-leaf-100 text-leaf-700' : 'border-line bg-surface text-ink-soft hover:bg-surface-sunk'
                      }`}
                    >
                      {c.name}
                      <span className="ml-2 text-xs font-medium opacity-70">{c.ageLabel}</span>
                    </Link>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-line px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:border-leaf-300 hover:text-leaf-600"
                >
                  <Plus size={15} aria-hidden="true" /> Add child
                </button>
              </>
            )}
          </div>

          {/* Section tabs for the selected child */}
          {base && (
            <div className="border-t border-line">
              <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-6" aria-label="Sections">
                {TABS.map(([suffix, label]) => {
                  const href = `${base}${suffix}`;
                  const active = pathname === href;
                  return (
                    <Link
                      key={label}
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                        active ? 'border-leaf-500 text-ink' : 'border-transparent text-ink-faint hover:text-ink-soft'
                      }`}
                    >
                      {label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          )}
        </header>

        <main id="main" className="mx-auto max-w-6xl px-6 py-8">
          {children}
        </main>
      </div>

      {adding && (
        <AddChildDialog
          onClose={() => setAdding(false)}
          onCreated={async (child) => {
            setAdding(false);
            await refresh();
            router.push(`/app/${child.id}`);
          }}
        />
      )}
    </ChildrenContext.Provider>
  );
}

export function LoadingBlock({ label = 'Loading' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-20 text-sm text-ink-faint">
      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
      {label}…
    </div>
  );
}
