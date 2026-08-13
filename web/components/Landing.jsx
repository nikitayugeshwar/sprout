'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sprout, Loader2, ArrowRight } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { Alert } from './ui';

export function SproutMark({ href = '/' }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-leaf-500 text-white">
        <Sprout size={19} strokeWidth={2.2} aria-hidden="true" />
      </span>
      <span className="font-display text-xl tracking-tight text-ink">Sprout</span>
    </Link>
  );
}

/**
 * Provisions a fresh, private demo account and drops the visitor straight into
 * it. Deliberately the loudest control on the page — a reviewer should never
 * have to invent credentials to see whether the thing works.
 */
export function DemoButton({ className = '' }) {
  const { startDemo } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const result = await startDemo();
      router.push(`/app/${result.children[0].id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-leaf-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-leaf-600 disabled:opacity-70 sm:w-auto"
      >
        {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
        {busy ? 'Building your demo…' : 'Explore the live demo'}
      </button>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </div>
  );
}
