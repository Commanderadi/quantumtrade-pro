import { formatMoney, formatPercent, formatSignedMoney } from '../lib/format';
import { Card, Notice, Stat } from './ui';

/** Totals converted into the user's display currency, with the rates used. */
export default function CombinedTotals({ combined, action, title }) {
    const c = combined;
    const rates = Object.entries(c.rates).filter(([from]) => from !== c.currency);
    return (
        <Card title={title ?? `Portfolio (${c.currency})`} actions={action}>
            <div className="stats">
                <Stat label="Market value" value={formatMoney(c.marketValue, c.currency)} />
                <Stat label="Cost basis" value={formatMoney(c.costBasis, c.currency)} />
                <Stat label="Today" value={formatSignedMoney(c.dayChange, c.currency)} sub={formatPercent(c.dayChangePercent)} tone={c.dayChange} />
                <Stat label="Unrealized P&L" value={formatSignedMoney(c.unrealizedPnl, c.currency)} sub={formatPercent(c.unrealizedPnlPercent)} tone={c.unrealizedPnl} />
                <Stat label="Realized P&L" value={formatSignedMoney(c.realizedPnl, c.currency)} tone={c.realizedPnl} />
            </div>
            {c.missingRates.length > 0 && (
                <Notice tone="warning">No exchange rate available for {c.missingRates.join(', ')}; those holdings are left out of this total.</Notice>
            )}
            <p className="muted small">
                {rates.length > 0 && <>Converted at today’s rates ({rates.map(([from, r]) => `1 ${from} = ${formatMoney(r, c.currency)}`).join(', ')}). </>}
                Profit and loss does not include currency movements since you bought.
            </p>
        </Card>
    );
}
