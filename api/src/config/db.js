import mongoose from 'mongoose';
import { config } from './env.js';
import { logger } from './logger.js';

let memoryServer = null;

/**
 * Connects to MongoDB.
 *
 * With no MONGODB_URI set (local development, CI, a reviewer cloning the repo)
 * we start an in-memory MongoDB so `npm run dev` works with zero setup. In
 * production this path is unreachable — env.js refuses to boot without a URI,
 * because an ephemeral database that empties on restart is a data-loss bug
 * waiting to happen.
 */
export async function connectDb() {
  mongoose.set('strictQuery', true);

  let uri = config.USE_IN_MEMORY_DB ? null : config.MONGODB_URI;

  if (!uri) {
    logger.warn(
      config.USE_IN_MEMORY_DB
        ? 'USE_IN_MEMORY_DB is set — ignoring MONGODB_URI and starting an in-memory MongoDB (data will not survive a restart)'
        : 'MONGODB_URI not set — starting an in-memory MongoDB (data will not survive a restart)',
    );
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create({ instance: { dbName: 'sprout' } });
    uri = memoryServer.getUri();
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10_000,
      maxPoolSize: 10,
    });
  } catch (err) {
    throw new Error(`${explainConnectionFailure(err, uri)}\n\nUnderlying driver error: ${err.message}`);
  }

  logger.info({ inMemory: Boolean(memoryServer) }, `MongoDB connected (${mongoose.connection.name})`);
  return mongoose.connection;
}

/**
 * Mongo connection errors are famously unhelpful — "querySrv ENOTFOUND" tells
 * you nothing about which of the four likely causes you actually hit. These
 * messages name the cause and the fix.
 */
export function explainConnectionFailure(err, uri = '') {
  const host = uri.replace(/^mongodb(\+srv)?:\/\/[^@]*@/, '').split(/[/?]/)[0] || '(unknown host)';

  if (err.code === 'ENOTFOUND' || /ENOTFOUND|querySrv/.test(err.message)) {
    return (
      `Cannot resolve the MongoDB host "${host}" — DNS says it does not exist.\n` +
      'Usually this means the Atlas cluster was deleted or never finished provisioning, or the\n' +
      'hostname in MONGODB_URI has a typo. Open the Atlas dashboard, check the cluster is running,\n' +
      'and copy the connection string again from Connect → Drivers.'
    );
  }
  if (/Authentication failed|bad auth/i.test(err.message)) {
    return (
      'The MongoDB host was reached but the username or password was rejected.\n' +
      'Check Atlas → Database Access. Remember that a password containing @ : / ? # [ ] must be\n' +
      'percent-encoded in the connection string.'
    );
  }
  if (/timed out|ETIMEDOUT|ServerSelectionError/i.test(err.message)) {
    return (
      `Reached DNS for "${host}" but could not open a connection before the timeout.\n` +
      'The usual cause is the Atlas IP allowlist: Atlas → Network Access must include this machine,\n' +
      'or 0.0.0.0/0 for a platform with non-fixed egress IPs such as Render.'
    );
  }
  return `Could not connect to MongoDB at "${host}".`;
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
  memoryServer = null;
}

export const dbState = () => ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] ?? 'unknown';
