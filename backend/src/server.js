'use strict';

const { loadEnv } = require('./config/env');
const { createLogger } = require('./logger');
const { createPool } = require('./db/pool');
const { migrate } = require('./db/migrate');
const { createMarketData } = require('./services/marketData');
const { createApp } = require('./app');
const { startAlertScheduler } = require('./jobs/alertScheduler');

async function main() {
    const env = loadEnv();
    const logger = createLogger(env);

    if (process.env.MIGRATE_ON_START !== 'false') {
        const applied = await migrate(env, logger);
        if (applied.length) logger.info({ applied }, 'Database migrated');
    }

    const db = createPool(env);
    await db.query('SELECT 1');
    const market = createMarketData({ env, logger });
    const app = createApp({ env, db, market, logger, staticDir: process.env.STATIC_DIR });
    const scheduler = startAlertScheduler({ env, db, market, logger });

    const server = app.listen(env.PORT, () => logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API listening'));
    server.keepAliveTimeout = 65_000; // longer than typical load balancer idle timeouts

    let shuttingDown = false;
    const shutdown = async (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;
        logger.info({ signal }, 'Shutting down');
        const force = setTimeout(() => process.exit(1), 15_000);
        force.unref();
        server.close(async () => {
            await scheduler.stop();
            await db.end();
            logger.info('Shutdown complete');
            process.exit(0);
        });
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled rejection'));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
