'use strict';

require('dotenv').config();
const { z } = require('zod');

const bool = z
    .enum(['true', 'false', '1', '0'])
    .transform((v) => v === 'true' || v === '1');

const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(5000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    DB_HOST: z.string().min(1).default('localhost'),
    DB_PORT: z.coerce.number().int().positive().default(3306),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().default(''),
    DB_NAME: z.string().min(1),
    DB_CONNECTION_LIMIT: z.coerce.number().int().positive().default(10),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168),
    COOKIE_SECURE: bool.optional(),

    // Comma-separated list of origins allowed to call the API from a browser.
    // Leave empty when the frontend is served from the same origin (recommended).
    CORS_ORIGINS: z.string().default(''),
    // Number of reverse proxies in front of the app (for correct client IPs in rate limiting).
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),

    ALPHA_VANTAGE_API_KEY: z.string().default(''),
    // Recommended for Indian (NSE/BSE) and international stocks.
    TWELVE_DATA_API_KEY: z.string().default(''),
    FINNHUB_API_KEY: z.string().default(''),
    COINGECKO_API_KEY: z.string().default(''),
    MARKET_DATA_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
    // How long stock quotes are reused. Free plans allow only a few requests per
    // minute, so keep this at 120+ seconds unless you have a paid plan.
    STOCK_QUOTE_CACHE_SECONDS: z.coerce.number().int().min(5).default(120),
    // Comma-separated "Label=SYMBOL" pairs shown in the dashboard indices strip.
    MARKET_INDICES: z
        .string()
        .default('S&P 500 (SPY ETF)=SPY,Nasdaq 100 (QQQ ETF)=QQQ,Dow Jones (DIA ETF)=DIA,Nifty 50 (NIFTYBEES ETF)=NIFTYBEES.NSE'),

    ALERT_CHECK_INTERVAL_SECONDS: z.coerce.number().int().min(0).default(300),

    // Coach (practice trading). Practice money only; costs approximate brokerage + charges.
    COACH_STARTING_CASH: z.coerce.number().positive().max(1e9).default(100_000),
    COACH_CURRENCY: z.enum(['INR', 'USD']).default('INR'),
    COACH_FEE_BPS: z.coerce.number().min(0).max(200).default(10),
    COACH_BENCHMARK_INR: z.string().trim().toUpperCase().default('NIFTYBEES.NSE'),
    COACH_BENCHMARK_USD: z.string().trim().toUpperCase().default('SPY'),
});

function loadEnv(source = process.env) {
    const parsed = schema.safeParse(source);
    if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
        throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    const env = parsed.data;
    if (env.COOKIE_SECURE === undefined) env.COOKIE_SECURE = env.NODE_ENV === 'production';
    env.CORS_ORIGINS = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
    env.MARKET_INDICES = env.MARKET_INDICES.split(',')
        .map((pair) => pair.trim())
        .filter(Boolean)
        .map((pair) => {
            const i = pair.lastIndexOf('=');
            if (i < 1) throw new Error(`Invalid environment configuration:\n  - MARKET_INDICES: "${pair}" must look like Label=SYMBOL`);
            return { label: pair.slice(0, i).trim(), symbol: pair.slice(i + 1).trim().toUpperCase() };
        });
    return Object.freeze(env);
}

module.exports = { loadEnv };
