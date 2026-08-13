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

  let uri = config.MONGODB_URI;

  if (!uri) {
    logger.warn('MONGODB_URI not set — starting an in-memory MongoDB (data will not survive a restart)');
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create({ instance: { dbName: 'sprout' } });
    uri = memoryServer.getUri();
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 10,
  });

  logger.info({ inMemory: Boolean(memoryServer) }, `MongoDB connected (${mongoose.connection.name})`);
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
  memoryServer = null;
}

export const dbState = () => ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] ?? 'unknown';
