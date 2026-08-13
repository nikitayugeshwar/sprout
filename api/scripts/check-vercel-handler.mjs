/**
 * Verifies the Vercel serverless handler without deploying.
 *
 * Vercel invokes `api/index.js` as `handler(req, res)` per request rather than
 * running a listening server, so the wiring that matters — Express routing
 * through the handler, and the connection cache surviving between invocations —
 * is not exercised by the normal test suite at all.
 *
 * This mounts the real handler behind a plain Node HTTP server (the same
 * contract Vercel uses), points it at a throwaway MongoDB, and drives it.
 *
 * Usage:  node scripts/check-vercel-handler.mjs
 */
import http from 'node:http';
import mongoose from 'mongoose';

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
};

console.log('Vercel handler check\n');

// A real mongod, so the handler's connection path runs for real. Must be set
// before importing the handler — config/env.js reads the environment at import.
console.log('starting a throwaway MongoDB...');
const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongod = await MongoMemoryServer.create({ instance: { dbName: 'sprout-vercel-check' } });

process.env.MONGODB_URI = mongod.getUri();
process.env.USE_IN_MEMORY_DB = 'false';
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'vercel-handler-check-secret-value';

const { default: handler } = await import('../api/index.js');

// Exactly how Vercel calls it: one handler invocation per request.
const server = http.createServer((req, res) => handler(req, res));
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
console.log(`handler mounted at ${base}\n`);

const call = async (path, opts = {}) => {
  const res = await fetch(base + path, {
    method: opts.method ?? 'GET',
    headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

const health = await call('/api/v1/health');
check('routing reaches Express through the handler', health.status === 200, `db=${health.json?.db}`);
check('the path is preserved (not rewritten)', health.json?.status === 'ok');

const meta = await call('/api/v1/meta');
check('a second route resolves', meta.status === 200 && meta.json.name === 'Sprout API');

// The cache is the whole point — a second invocation must not reconnect.
const connectionsBefore = mongoose.connections.length;
await call('/api/v1/health');
await call('/api/v1/meta');
check('warm invocations reuse the cached connection', mongoose.connections.length === connectionsBefore, `${mongoose.connections.length} connection(s)`);
check('mongoose is connected', mongoose.connection.readyState === 1);

// A full write path, to prove models work under the serverless entry too.
const demo = await call('/api/v1/auth/demo', { method: 'POST' });
check('POST /auth/demo works through the handler', demo.status === 201 && demo.json.children?.length === 2);

const overview = await call(`/api/v1/children/${demo.json.children[0].id}/overview`, { token: demo.json.token });
check('authenticated route works', overview.status === 200 && Boolean(overview.json.growth));
check('growth is computed in the serverless path', Number.isFinite(overview.json.growth.latest?.results?.wfa?.z), `z=${overview.json.growth.latest?.results?.wfa?.z}`);

const missing = await call('/api/v1/nope');
check('unknown routes still 404 (not 500)', missing.status === 404, `got ${missing.status}`);

const unauth = await call('/api/v1/children');
check('auth is still enforced', unauth.status === 401, `got ${unauth.status}`);

console.log(`\n${failures === 0 ? 'handler is deployable' : `${failures} check(s) failed`}`);

server.close();
await mongoose.disconnect();
await mongod.stop();
process.exit(failures ? 1 : 0);
