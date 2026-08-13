/**
 * Vercel serverless entry point for the Sprout API.
 *
 * `src/index.js` is the real server — it calls app.listen() and owns its
 * process. Vercel never runs that: it invokes a handler per request and may
 * freeze or discard the container between calls. So this file wraps the same
 * Express app as a function, with the two changes serverless actually demands.
 *
 *   1. The Mongo connection is cached on globalThis, not created per request.
 *      A warm container reuses its connection; without this, every invocation
 *      would open a new one and a traffic spike would exhaust the Atlas
 *      connection limit long before it exhausted anything else.
 *
 *   2. bufferCommands is off and the pool is small. A serverless container
 *      handles one request at a time, so a large pool is wasted sockets, and
 *      silently buffering queries against a dead connection turns an outage
 *      into a timeout instead of an error.
 *
 * Deploy with Root Directory = `api` (see vercel.json alongside this file).
 */
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { config, configErrors } from '../src/config/env.js';
import { explainConnectionFailure } from '../src/config/db.js';

/**
 * Survives module re-evaluation within a warm container, which is what makes
 * this a cache rather than a variable that resets on every cold path.
 */
const cache = (globalThis.__sprout ??= { conn: null, connecting: null, app: null });

async function connect() {
  if (cache.conn && mongoose.connection.readyState === 1) return cache.conn;

  if (!config.MONGODB_URI) {
    // The in-memory fallback downloads and spawns a mongod binary — impossible
    // in a read-only serverless filesystem, and pointless when the container is
    // discarded. Fail with the reason rather than hanging.
    throw new Error('MONGODB_URI is required on Vercel. The in-memory database cannot run in a serverless container.');
  }

  // Collapse concurrent cold-start requests onto one connection attempt.
  cache.connecting ??= mongoose
    .connect(config.MONGODB_URI, {
      serverSelectionTimeoutMS: 10_000,
      maxPoolSize: 5,
      bufferCommands: false,
    })
    .then((m) => {
      cache.conn = m;
      return m;
    })
    .catch((err) => {
      // Clear the promise so the next invocation retries instead of replaying
      // a rejected one forever.
      cache.connecting = null;
      throw new Error(`${explainConnectionFailure(err, config.MONGODB_URI)}\n\nUnderlying driver error: ${err.message}`);
    });

  return cache.connecting;
}

function fail(res, status, code, message, extra = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: { code, message, ...extra } }));
}

export default async function handler(req, res) {
  // Missing environment variables are the single most common deployment
  // mistake, so they get a response that names them. Reporting this here
  // rather than exiting at import time is the difference between "500,
  // FUNCTION_INVOCATION_FAILED" and a message telling you what to set.
  if (configErrors.length) {
    return fail(res, 503, 'configuration_error', 'The API is not configured correctly.', {
      missing: configErrors,
      hint: 'Set these in your hosting provider’s environment variables, then redeploy.',
    });
  }

  try {
    await connect();
    cache.app ??= createApp();
    return cache.app(req, res);
  } catch (err) {
    return fail(res, 503, 'database_unavailable', err.message);
  }
}
