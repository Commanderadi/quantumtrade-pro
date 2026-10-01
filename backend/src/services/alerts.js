'use strict';

/** Returns the observed value if the alert's condition is met by `quote`, otherwise null. */
function evaluateAlert(alert, quote) {
    const target = Number(alert.target_value);
    switch (alert.condition) {
        case 'price_above':
            return quote.price >= target ? quote.price : null;
        case 'price_below':
            return quote.price <= target ? quote.price : null;
        case 'change_pct_above':
            return quote.changePercent !== null && quote.changePercent >= target ? quote.changePercent : null;
        case 'change_pct_below':
            return quote.changePercent !== null && quote.changePercent <= target ? quote.changePercent : null;
        default:
            return null;
    }
}

/**
 * Checks every active alert against live quotes. Triggered alerts are
 * deactivated (one-shot) and stamped with the time and observed value.
 */
async function checkAlerts({ db, market, logger, userId }) {
    const params = userId ? [userId] : [];
    const [alerts] = await db.execute(
        `SELECT id, user_id, symbol, asset_type, \`condition\`, target_value
           FROM alerts WHERE is_active = 1 ${userId ? 'AND user_id = ?' : ''}`,
        params
    );
    if (!alerts.length) return { checked: 0, triggered: 0 };

    let triggered = 0;
    for (const type of ['stock', 'crypto']) {
        const forType = alerts.filter((a) => a.asset_type === type);
        if (!forType.length) continue;
        const { quotes, errors } = await market.getQuotes(type, forType.map((a) => a.symbol));
        if (errors.size) logger?.warn({ type, errors: Object.fromEntries(errors) }, 'Some alert quotes unavailable');
        for (const alert of forType) {
            const quote = quotes.get(alert.symbol);
            if (!quote) continue;
            const value = evaluateAlert(alert, quote);
            if (value === null) {
                await db.execute('UPDATE alerts SET last_checked_at = UTC_TIMESTAMP() WHERE id = ?', [alert.id]);
                continue;
            }
            // `is_active = 1` guard keeps this idempotent if two checks race.
            const [res] = await db.execute(
                `UPDATE alerts SET is_active = 0, triggered_at = UTC_TIMESTAMP(), triggered_value = ?, last_checked_at = UTC_TIMESTAMP()
                  WHERE id = ? AND is_active = 1`,
                [value, alert.id]
            );
            if (res.affectedRows) triggered += 1;
        }
    }
    return { checked: alerts.length, triggered };
}

module.exports = { evaluateAlert, checkAlerts };
