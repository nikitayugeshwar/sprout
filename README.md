# Sprout

**Child growth, milestones and immunisation — measured against the real standards.**

Every parent asks whether their child is growing normally. The usual answer is a number on a
clinic wall chart, remembered badly. Sprout keeps the measurements, scores them against the
actual WHO Child Growth Standards, and says plainly when something is worth a conversation —
and when it genuinely is not.

Built with **Next.js · Express · MongoDB · JavaScript · Tailwind CSS**.

---

## The part that is not CRUD

Most tracker apps store a weight and draw a line. The interesting problem is turning that
weight into a number that means something, and that is where most of the engineering here went.

### 1. The growth engine is derived from WHO's own tables, not transcribed

`api/scripts/build-who-tables.mjs` downloads the eight official *z-score expanded tables*
workbooks from `cdn.who.int`, extracts the L/M/S parameters, and emits them as JSON:

```
wfa  weight-for-age              boys + girls   1857 daily rows each
lhfa length/height-for-age       boys + girls   1857 daily rows each
bfa  BMI-for-age                 boys + girls   1857 daily rows each
hcfa head circumference-for-age  boys + girls   1857 daily rows each
                                                ────────────────────
                                                14,856 reference rows
```

Nothing is hand-typed, so nothing can be mistyped. Re-run `npm run who:build` and it rebuilds
from source.

### 2. The maths is the published method, including the parts people skip

A measurement becomes a z-score through the Box-Cox transform:

```
L ≠ 0 :  z = ((X/M)^L − 1) / (L·S)
L = 0 :  z = ln(X/M) / S
```

Beyond ±3 SD the Box-Cox tails become unstable for weight-based indicators, so WHO prescribes a
linear extrapolation anchored on the 2nd-to-3rd SD gap. Sprout applies it — to weight-for-age,
BMI-for-age and weight-for-length, but **not** to height or head circumference, whose
distributions are normal. That distinction is the sort of thing that is easy to get wrong and
impossible to notice from the UI.

Ages are interpolated between WHO's daily rows rather than snapped to the nearest one, and the
normal CDF uses Hart's rational approximation (~1e-15) rather than a table lookup.

### 3. The tests prove the maths against WHO's own numbers

This is the part I would want a reviewer to look at. A wrong z-score is *plausible* — −1.6 looks
as reasonable as the correct −2.1 — so testing against numbers I made up would prove nothing.

The build script also extracts WHO's published SD3neg…SD3 cut-off columns as fixtures. The test
suite recomputes those cut-offs from the LMS parameters and asserts they match:

```
✔ LMS values reproduce WHO published SD cut-offs for every indicator
  ✔ wfa / male     ✔ wfa / female
  ✔ lhfa / male    ✔ lhfa / female
  ✔ bfa / male     ✔ bfa / female
  ✔ hcfa / male    ✔ hcfa / female
```

That is **3,472 comparisons against WHO's own published values**, every one within 0.01. Plus
round-trip inversion, the ±3 SD correction's continuity and monotonicity, the normal CDF against
known reference values, and the schedule/insight engines. 19 tests, `npm test`.

### 4. Trend beats snapshot

One reading says very little. Children track along their own percentile channel, so what matters
is *drift*. Sprout watches the z-score between visits and flags a crossed channel — 0.67 SD, the
width of one channel on a printed chart, which is the threshold clinicians actually use.

The demo data is built around this: Meera's weight falls from the 54th to the 1st percentile
across six visits while her length tracks normally. That is textbook weight faltering, and it is
what makes the insight engine visibly earn its place instead of printing green ticks.

### 5. The insight engine says fewer, better things

A dashboard that flags everything trains people to ignore it. So insights are ranked by severity,
capped at six, and each one carries the evidence that produced it. When several indicators fire
for the same underlying cause — weight faltering trips weight-for-age *and* BMI-for-age — they
merge into one card with the others as corroboration, rather than saying the same thing twice in
different words.

Nothing here diagnoses. Every flag is phrased as "worth raising at your next visit".

---

## Also built

- **JWT auth** with bcrypt, httpOnly cookie *and* bearer token (the reference deployment is
  cross-origin, where third-party cookies are not a bet worth making). Ownership is enforced in
  middleware, so no future route can forget to check it.
- **159 CDC milestones** (2022 revision) across four domains and twelve checkpoints, with an
  age-scaled grace window so it prompts rather than panics.
- **38 IAP vaccine doses** generated from a date of birth, with catch-up windows — a late dose
  reads as "still catchable", not "missed". Coverage is measured against doses *due*, so a
  newborn is 100% covered rather than 5%.
- **Zod validation** returning field-level errors in one round trip, rate limiting, Helmet, CORS
  allowlist, structured error codes, pino logging with credential redaction, graceful shutdown.
- **Hand-rolled SVG growth charts** — percentile bands, dashed ±2 SD thresholds, keyboard-
  reachable points, tooltips, and a fully tokenised palette so dark mode needed no `dark:`
  variants anywhere.

---

## Running it

Requires Node 22+.

```bash
npm install
npm run dev          # API on :4000, web on :3000
```

That is the whole setup. With no `MONGODB_URI` set, the API starts an in-memory MongoDB
automatically — the first run downloads a ~780 MB MongoDB binary and caches it, so give it a
minute. Point `MONGODB_URI` at a real database (or run `docker compose up`) to skip that.

Open http://localhost:3000 and click **Explore the live demo**. That provisions a private,
fully-writable account seeded with two children and two years of history — no credentials to
invent, and nothing you do affects anyone else's demo.

```bash
npm test                            # 19 tests, incl. the WHO conformance suite
npm run who:build                   # rebuild the reference tables from cdn.who.int
npm run seed                        # stable demo login (needs MONGODB_URI)
node api/scripts/smoke.mjs [url]    # 46-check end-to-end run against a live API
```

`smoke.mjs` exercises the whole flow a real visitor takes — provision, read the dashboard, pull a
chart, tick a milestone, record a dose, plus the authorisation and validation paths — and asserts
the responses are *coherent*, not merely `200`. Run it against a deployment to verify it.

---

## Layout

```
api/
  scripts/build-who-tables.mjs   downloads + parses WHO's workbooks
  scripts/smoke.mjs              end-to-end check against a running API
  scripts/seed.js                stable demo account
  src/services/growth/           LMS maths, table loader, assessment
  src/services/milestones/       CDC catalogue
  src/services/vaccines/         IAP schedule engine
  src/services/insights/         the ranking/merging logic
  src/routes/                    auth, children, reference
  tests/                         WHO conformance + engine tests
web/
  app/                           Next.js App Router
  components/GrowthChart.jsx     the SVG chart
  lib/api.js                     typed-ish API client
```

See [DEPLOY.md](DEPLOY.md) for hosting.

---

## Data sources

| | |
|---|---|
| Growth | WHO Child Growth Standards (2006), z-score expanded tables, `cdn.who.int` |
| Milestones | CDC "Learn the Signs. Act Early." (2022 revision) — Zubler et al., *Pediatrics* 149(3) |
| Immunisation | IAP ACVIP recommended schedule, 0–6 years |

**Sprout is a record-keeping and awareness tool. It does not diagnose and does not replace a
paediatrician.** Vaccine brands, combinations and timing vary; follow the schedule your
paediatrician gives you.

Built by Nikita Yugeshwar.
