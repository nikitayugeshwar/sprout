/**
 * End-to-end smoke test against a running API.
 *
 * Exercises the whole flow a real visitor takes — provision a demo account,
 * read the dashboard, pull a growth chart, tick a milestone, record a dose —
 * and asserts the responses are actually coherent rather than merely 200.
 *
 * Usage:  node scripts/smoke.mjs [baseUrl]
 */
const BASE = (process.argv[2] ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');

let token = null;
let failures = 0;
let checks = 0;

function check(label, condition, detail = '') {
  checks += 1;
  if (condition) {
    console.log(`  ok    ${label}${detail ? `  ${detail}` : ''}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? `  ${detail}` : ''}`);
  }
}

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

console.log(`Sprout smoke test → ${BASE}\n`);

// --- health & meta ---------------------------------------------------------
console.log('health');
const health = await call('/health');
check('GET /health is ok', health.status === 200 && health.json.status === 'ok', `db=${health.json?.db}`);

const meta = await call('/meta');
check('GET /meta lists data sources', meta.status === 200 && meta.json.dataSources.length === 3);

// --- auth ------------------------------------------------------------------
console.log('\nauth');
const anon = await call('/children');
check('unauthenticated read is rejected', anon.status === 401, `got ${anon.status}`);

const demo = await call('/auth/demo', { method: 'POST' });
check('POST /auth/demo provisions an account', demo.status === 201 && Boolean(demo.json.token));
check('demo account is seeded with two children', demo.json?.children?.length === 2, JSON.stringify(demo.json?.children?.map((c) => c.name)));
token = demo.json.token;

const me = await call('/auth/me');
check('GET /auth/me returns the session user', me.status === 200 && me.json.user.email === demo.json.user.email);
check('password hash never leaves the server', !JSON.stringify(me.json).includes('passwordHash'));

// --- children --------------------------------------------------------------
console.log('\nchildren');
const list = await call('/children');
check('GET /children returns both children', list.json.children.length === 2);

const meera = list.json.children.find((c) => c.name === 'Meera');
const aarav = list.json.children.find((c) => c.name === 'Aarav');
check('children carry a derived age label', Boolean(meera?.ageLabel), `Meera is ${meera?.ageLabel}, Aarav is ${aarav?.ageLabel}`);

// Ownership: a second demo account must not see the first one's children.
const otherToken = token;
const demo2 = await call('/auth/demo', { method: 'POST' });
token = demo2.json.token;
const cross = await call(`/children/${meera.id}/overview`);
check('another account cannot read this child', cross.status === 403, `got ${cross.status}`);
token = otherToken;

// --- overview / insights ---------------------------------------------------
console.log('\noverview & insights');
const ov = await call(`/children/${meera.id}/overview`);
check('GET overview succeeds', ov.status === 200);
check('growth has a latest assessment', Boolean(ov.json.growth.latest?.results?.wfa));

const wfa = ov.json.growth.latest.results.wfa;
check('weight-for-age carries z + percentile', Number.isFinite(wfa.z) && Number.isFinite(wfa.percentile), `z=${wfa.z} p${wfa.percentile} ${wfa.classificationLabel}`);
check('Meera’s weight faltering is detected', ov.json.growth.trends.wfa.drift <= -0.67, `drift=${ov.json.growth.trends.wfa.drift} SD`);

const topInsight = ov.json.insights[0];
check('insights are returned, most severe first', ov.json.insights.length > 0 && topInsight.severity === 'high', `“${topInsight?.title}”`);
check('insights carry their evidence', Boolean(topInsight?.evidence));
check('immunisation gaps are counted', ov.json.immunisation.counts.overdue + ov.json.immunisation.counts.missed > 0, `${ov.json.immunisation.counts.overdue} overdue, ${ov.json.immunisation.counts.missed} past catch-up`);

const ovA = await call(`/children/${aarav.id}/overview`);
check('the healthy child reads as healthy', ovA.json.insights.every((i) => i.severity !== 'high'), `top: “${ovA.json.insights[0]?.title}”`);

// --- growth charts ---------------------------------------------------------
console.log('\ngrowth charts');
for (const ind of ['wfa', 'lhfa', 'bfa', 'hcfa']) {
  const g = await call(`/children/${meera.id}/growth/${ind}`);
  const curveLengths = Object.values(g.json.reference.curves).map((c) => c.length);
  check(
    `GET growth/${ind} returns curves + points`,
    g.status === 200 && g.json.points.length > 0 && new Set(curveLengths).size === 1 && curveLengths[0] === g.json.reference.ageMonths.length,
    `${g.json.points.length} points, ${curveLengths[0]} curve samples`,
  );
}

const ref = await call('/reference/growth/wfa?sex=female&toMonths=24');
check('public reference curves are available', ref.status === 200 && ref.json.curves['0'].length > 0);

// --- measurements ----------------------------------------------------------
console.log('\nmeasurements');
const before = (await call(`/children/${meera.id}/measurements`)).json.measurements.length;
const added = await call(`/children/${meera.id}/measurements`, { method: 'POST', body: { weightKg: 7.4, heightCm: 68.5, takenAt: new Date().toISOString() } });
check('POST measurement is scored immediately', added.status === 201 && Number.isFinite(added.json.measurement.results.wfa.z), `z=${added.json.measurement.results?.wfa?.z}`);

const after = (await call(`/children/${meera.id}/measurements`)).json.measurements.length;
check('measurement count increased', after === before + 1);

const bad = await call(`/children/${meera.id}/measurements`, { method: 'POST', body: { weightKg: 900 } });
check('out-of-range weight is rejected', bad.status === 422, `got ${bad.status}`);

const empty = await call(`/children/${meera.id}/measurements`, { method: 'POST', body: {} });
check('a measurement with no values is rejected', empty.status === 422, `got ${empty.status}`);

const future = await call(`/children/${meera.id}/measurements`, { method: 'POST', body: { weightKg: 7, takenAt: '2099-01-01' } });
check('a future measurement is rejected', future.status === 422, `got ${future.status}`);

const del = await call(`/children/${meera.id}/measurements/${added.json.measurement.id}`, { method: 'DELETE' });
check('measurement can be deleted', del.status === 200);

// --- milestones ------------------------------------------------------------
console.log('\nmilestones');
const ms = await call(`/children/${meera.id}/milestones`);
check('GET milestones returns the full catalogue', ms.status === 200 && ms.json.items.length > 100, `${ms.json.items.length} items`);
check('checkpoints are summarised', ms.json.checkpoints.length === 12);

// Prefer one that is already due; a well-tracked child may not have any, in
// which case any unticked milestone exercises the same path.
const target =
  ms.json.items.find((i) => i.status !== 'achieved' && i.due) ?? ms.json.items.find((i) => i.status !== 'achieved');
const tick = await call(`/children/${meera.id}/milestones/${target.key}`, { method: 'PUT', body: { status: 'achieved' } });
check('a milestone can be ticked', tick.status === 200 && tick.json.record.status === 'achieved', `“${target.text}”`);

const tickAgain = await call(`/children/${meera.id}/milestones/${target.key}`, { method: 'PUT', body: { status: 'achieved' } });
const msAfter = await call(`/children/${meera.id}/milestones`);
check('re-ticking updates rather than duplicates', tickAgain.status === 200 && msAfter.json.items.length === ms.json.items.length);

const badMs = await call(`/children/${meera.id}/milestones/not-a-milestone`, { method: 'PUT', body: { status: 'achieved' } });
check('an unknown milestone key is rejected', badMs.status === 404, `got ${badMs.status}`);

// --- immunisation ----------------------------------------------------------
console.log('\nimmunisation');
const imm = await call(`/children/${meera.id}/immunisation`);
check('GET immunisation returns the plan', imm.status === 200 && imm.json.doses.length > 30, `${imm.json.doses.length} doses`);
check('doses are grouped into visits', imm.json.visits.length > 5);
check('the plan carries its source and disclaimer', Boolean(imm.json.source?.disclaimer));

const dose = imm.json.doses.find((d) => d.status === 'overdue');
const rec = await call(`/children/${meera.id}/immunisation/${dose.key}`, { method: 'PUT', body: { administeredAt: new Date().toISOString() } });
check('an overdue dose can be recorded', rec.status === 200, `${dose.vaccine} ${dose.doseLabel}`);

const immAfter = await call(`/children/${meera.id}/immunisation`);
check('recording lifts coverage', immAfter.json.coverage > imm.json.coverage, `${imm.json.coverage} → ${immAfter.json.coverage}`);
check('the recorded dose now reads as given', immAfter.json.doses.find((d) => d.key === dose.key).status === 'given');

await call(`/children/${meera.id}/immunisation/${dose.key}`, { method: 'DELETE' });
const immReverted = await call(`/children/${meera.id}/immunisation`);
check('clearing a dose reverts it', immReverted.json.doses.find((d) => d.key === dose.key).status !== 'given');

// --- create + delete a child ----------------------------------------------
console.log('\nchild lifecycle');
const created = await call('/children', { method: 'POST', body: { name: 'Test Baby', sex: 'male', dob: new Date(Date.now() - 200 * 86400000).toISOString() } });
check('POST /children creates a child', created.status === 201 && created.json.child.ageLabel);

const newOverview = await call(`/children/${created.json.child.id}/overview`);
check('a child with no data still returns an overview', newOverview.status === 200 && newOverview.json.insights.length > 0, `“${newOverview.json.insights[0]?.title}”`);

const removed = await call(`/children/${created.json.child.id}`, { method: 'DELETE' });
check('DELETE /children removes it', removed.status === 200);
check('the deleted child is gone', (await call(`/children/${created.json.child.id}`)).status === 404);

const badChild = await call('/children', { method: 'POST', body: { name: '', sex: 'other', dob: 'nonsense' } });
check('invalid child input returns field-level errors', badChild.status === 422 && badChild.json.error.details.length === 3, JSON.stringify(badChild.json.error?.details?.map((d) => d.field)));

// --- result ----------------------------------------------------------------
console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
