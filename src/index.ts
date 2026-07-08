import { buildApp } from './app.js';
import { config } from './config.js';
import { runMigrations } from './db/migrate.js';
import { logger } from './logger.js';
import { closeBrowser } from './services/browser.js';
import { closeActiveCapture } from './services/capture.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';

async function main(): Promise<void> {
  runMigrations();

  const app = await buildApp();
  await app.listen({ host: config.HOST, port: config.PORT });
  logger.info(`Full-Text RSS Bridge listening on ${config.PUBLIC_BASE_URL}`);

  startScheduler();

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down`);
    stopScheduler();
    await closeActiveCapture();
    await app.close();
    await closeBrowser();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error(err, 'Fatal startup error');
  process.exit(1);
});
