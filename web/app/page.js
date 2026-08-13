import Link from 'next/link';
import { Activity, ShieldCheck, ListChecks, LineChart, Code2 } from 'lucide-react';
import { DemoButton, SproutMark } from '../components/Landing';

const FEATURES = [
  {
    icon: LineChart,
    title: 'Real WHO percentiles',
    body: 'Weight, height, BMI and head circumference are scored against the WHO Child Growth Standards using the published LMS parameters — not a lookup table someone eyeballed off a chart.',
  },
  {
    icon: Activity,
    title: 'Trend, not snapshot',
    body: 'A single reading says little. Sprout watches the z-score between visits and flags a crossed percentile channel, which is what a paediatrician actually looks for.',
  },
  {
    icon: ListChecks,
    title: 'Milestones that mean something',
    body: '159 CDC "Learn the Signs" milestones across four domains, surfaced at the right checkpoint with a grace window — so it prompts rather than panics.',
  },
  {
    icon: ShieldCheck,
    title: 'Vaccines on schedule',
    body: 'The full IAP 0–6 year schedule generated from your child’s date of birth, with catch-up windows so a late dose reads as "still catchable", not "missed".',
  },
];

export default function Home() {
  return (
    <main id="main">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <SproutMark />
        <nav className="flex items-center gap-1 text-sm font-semibold">
          <Link href="/login" className="rounded-xl px-4 py-2.5 text-ink-soft transition-colors hover:bg-surface-sunk hover:text-ink">
            Sign in
          </Link>
          <Link href="/register" className="rounded-xl bg-leaf-500 px-4 py-2.5 text-white transition-colors hover:bg-leaf-600">
            Create account
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-10 sm:pt-16">
        <div className="rise max-w-3xl">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-leaf-200 bg-leaf-50 px-3 py-1.5 text-xs font-semibold text-leaf-700">
            WHO Child Growth Standards · CDC milestones · IAP immunisation
          </p>
          <h1 className="font-display text-4xl leading-[1.1] tracking-tight text-ink sm:text-6xl">
            Is my child growing normally?
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft">
            Every parent asks it. Most answers are a number on a clinic wall chart, remembered badly. Sprout keeps the
            measurements, plots them against the real growth standards, and tells you plainly when something is worth a
            conversation — and when it genuinely is not.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <DemoButton />
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-xl border border-line bg-surface px-5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-surface-sunk"
            >
              Create a free account
            </Link>
          </div>
          <p className="mt-3 text-xs text-ink-faint">
            The demo builds you a private account with two children and two years of history. Nothing to sign up for, and you
            can change anything in it.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card p-6">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-leaf-100 text-leaf-600">
                <Icon size={20} strokeWidth={2} aria-hidden="true" />
              </div>
              <h2 className="font-display text-lg text-ink">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-surface-sunk">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-14 sm:grid-cols-3">
          {[
            ['14,856', 'WHO LMS reference rows, parsed straight from the published tables'],
            ['159', 'CDC milestones across four developmental domains'],
            ['38', 'IAP vaccine doses scheduled from a date of birth'],
          ].map(([stat, label]) => (
            <div key={stat}>
              <div className="tabular font-display text-4xl text-leaf-600">{stat}</div>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-10">
        <p className="max-w-3xl text-xs leading-relaxed text-ink-faint">
          Sprout is a record-keeping and awareness tool. It does not diagnose, and it is not a substitute for your
          paediatrician. Growth references: WHO Child Growth Standards (2006). Milestones: CDC “Learn the Signs. Act Early.”
          (2022 revision). Immunisation: IAP ACVIP recommended schedule.
        </p>
        <div className="mt-6 flex items-center justify-between border-t border-line pt-6 text-xs text-ink-faint">
          <span>Built by Nikita Yugeshwar</span>
          <a href="https://github.com/" className="inline-flex items-center gap-1.5 transition-colors hover:text-ink">
            <Code2 size={14} aria-hidden="true" /> Source
          </a>
        </div>
      </footer>
    </main>
  );
}
