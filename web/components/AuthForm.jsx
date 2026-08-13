'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { SproutMark, DemoButton } from './Landing';
import { Alert, Button, Field, Input } from './ui';
import { ApiError } from '../lib/api';

const COPY = {
  login: {
    title: 'Welcome back',
    blurb: 'Sign in to pick up where you left off.',
    submit: 'Sign in',
    swapText: 'New here?',
    swapLabel: 'Create an account',
    swapHref: '/register',
  },
  register: {
    title: 'Create your account',
    blurb: 'Free, and takes about twenty seconds.',
    submit: 'Create account',
    swapText: 'Already have an account?',
    swapLabel: 'Sign in',
    swapHref: '/login',
  },
};

export function AuthForm({ mode }) {
  const copy = COPY[mode];
  const { login, register } = useAuth();
  const router = useRouter();

  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    try {
      const result = mode === 'login' ? await login(values.email, values.password) : await register(values.name, values.email, values.password);
      // Land on the first child if there is one, otherwise the empty state.
      router.push('/app');
      return result;
    } catch (err) {
      if (err instanceof ApiError && err.details) setFieldErrors(err.fieldErrors);
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-8 flex justify-center">
        <SproutMark />
      </div>

      <div className="card p-7">
        <h1 className="font-display text-2xl text-ink">{copy.title}</h1>
        <p className="mt-1.5 text-sm text-ink-soft">{copy.blurb}</p>

        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          {mode === 'register' && (
            <Field label="Your name" error={fieldErrors.name}>
              <Input value={values.name} onChange={set('name')} autoComplete="name" invalid={Boolean(fieldErrors.name)} placeholder="Nikita" />
            </Field>
          )}

          <Field label="Email" error={fieldErrors.email}>
            <Input
              type="email"
              value={values.email}
              onChange={set('email')}
              autoComplete="email"
              invalid={Boolean(fieldErrors.email)}
              placeholder="you@example.com"
            />
          </Field>

          <Field
            label="Password"
            error={fieldErrors.password}
            hint={mode === 'register' ? 'At least 8 characters.' : undefined}
          >
            <Input
              type="password"
              value={values.password}
              onChange={set('password')}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              invalid={Boolean(fieldErrors.password)}
            />
          </Field>

          {error && <Alert>{error}</Alert>}

          <Button type="submit" disabled={busy} className="w-full">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {copy.submit}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-soft">
          {copy.swapText}{' '}
          <Link href={copy.swapHref} className="font-semibold text-leaf-600 hover:underline">
            {copy.swapLabel}
          </Link>
        </p>
      </div>

      <div className="mt-6 text-center">
        <p className="mb-3 text-xs text-ink-faint">Or skip the form entirely</p>
        <DemoButton />
      </div>
    </main>
  );
}
