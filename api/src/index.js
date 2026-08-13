import { createApp } from './app.js';
import { config } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDb, disconnectDb } from './config/db.js';

async function main() {
  await connectDb();

  const app = createApp();
  const server = app.listen(config.PORT, () => {
    logger.info(`Sprout API listening on http://localhost:${config.PORT}/api/v1  [${config.NODE_ENV}]`);
  });

  /**
   * Finish in-flight requests before exiting. PaaS platforms send SIGTERM and
   * then hard-kill after a grace period, so a request served mid-deploy should
   * not simply drop.
   */
  const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down`);
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'failed to start');
  process.exit(1);
});
