'use strict';

const { checkAlerts } = require('../services/alerts');

const LOCK_NAME = 'quantumtrade_alert_check';

/**
 * Periodically evaluates alerts. A MySQL named lock ensures that only one
 * instance runs a check at a time when the API is horizontally scaled.
 */
function startAlertScheduler({ env, db, market, logger }) {
    const intervalMs = env.ALERT_CHECK_INTERVAL_SECONDS * 1000;
    if (!intervalMs) {
        logger.info('Alert scheduler disabled');
        return { stop: async () => {} };
    }

    let running = null;
    const run = async () => {
        if (running) return;
        running = (async () => {
            const conn = await db.getConnection();
            try {
                const [[{ locked }]] = await conn.query('SELECT GET_LOCK(?, 0) AS locked', [LOCK_NAME]);
                if (locked !== 1) return;
                try {
                    const result = await checkAlerts({ db, market, logger });
                    if (result.checked) logger.info(result, 'Alert check complete');
                } finally {
                    await conn.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
                }
            } catch (err) {
                logger.error({ err }, 'Alert check failed');
            } finally {
                conn.release();
            }
        })();
        await running;
        running = null;
    };

    const timer = setInterval(run, intervalMs);
    timer.unref();
    logger.info({ intervalSeconds: env.ALERT_CHECK_INTERVAL_SECONDS }, 'Alert scheduler started');
    return {
        stop: async () => {
            clearInterval(timer);
            if (running) await running;
        },
    };
}

module.exports = { startAlertScheduler };
