'use strict';

const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');
const { rateLimit } = require('express-rate-limit');

const { requireAuth } = require('./middleware/auth');
const { requireCsrfHeader } = require('./middleware/csrf');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { authRouter } = require('./routes/auth');
const { marketRouter } = require('./routes/market');
const { watchlistRouter } = require('./routes/watchlist');
const { portfolioRouter } = require('./routes/portfolio');
const { alertsRouter } = require('./routes/alerts');
const { quantRouter } = require('./routes/quant');
const { coachRouter } = require('./routes/coach');
const { createCoach } = require('./services/coach/account');

/**
 * Builds the Express app. Dependencies are injected so tests can supply a
 * test database and a stubbed market data service.
 */
function createApp({ env, db, market, logger, staticDir }) {
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', env.TRUST_PROXY);

    // Rate limits are in-memory per instance; use a shared store (e.g. Redis) when scaling out.
    const limiter = (opts) =>
        rateLimit({
            standardHeaders: 'draft-7',
            legacyHeaders: false,
            skip: () => env.NODE_ENV === 'test' && !env.RATE_LIMIT_IN_TEST,
            handler: (_req, res, _next, options) => res.status(options.statusCode).json({ error: options.message }),
            ...opts,
        });

    app.use(
        pinoHttp({
            logger,
            autoLogging: { ignore: (req) => req.url.startsWith('/api/health') },
            serializers: {
                req: (req) => ({ id: req.id, method: req.method, url: req.url }),
                res: (res) => ({ statusCode: res.statusCode }),
            },
        })
    );
    // HTTPS-only headers are enabled together with secure cookies, so a plain
    // HTTP deployment (e.g. local docker compose) keeps working.
    const https = env.COOKIE_SECURE;
    app.use(
        helmet({
            hsts: https,
            contentSecurityPolicy: {
                directives: {
                    // CoinGecko serves coin logos from its CDN.
                    'img-src': ["'self'", 'data:', 'https://coin-images.coingecko.com', 'https://assets.coingecko.com'],
                    'upgrade-insecure-requests': https ? [] : null,
                },
            },
        })
    );
    if (env.CORS_ORIGINS.length) {
        app.use('/api', cors({ origin: env.CORS_ORIGINS, credentials: true }));
    }
    app.use(compression());
    app.use(express.json({ limit: '20kb' }));
    app.use(cookieParser());

    app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
    app.get('/api/health/ready', async (_req, res) => {
        try {
            await db.query('SELECT 1');
            res.json({ status: 'ok', database: 'up' });
        } catch {
            res.status(503).json({ status: 'error', database: 'down' });
        }
    });

    app.use('/api', limiter({ windowMs: 60_000, limit: 300, message: 'Too many requests, please slow down.' }));
    app.use('/api', requireCsrfHeader);

    const auth = requireAuth({ env, db });
    const authLimiter = limiter({ windowMs: 15 * 60_000, limit: 20, message: 'Too many attempts, please try again later.' });
    const alertCheckLimiter = limiter({
        windowMs: 60_000, limit: 3, message: 'Alerts can be checked at most 3 times per minute.',
        keyGenerator: (req) => `alerts:${req.user.id}`,
    });

    // Research endpoints fetch several price histories and run simulations, so they get a tighter per-user limit.
    const quantLimiter = limiter({
        windowMs: 60_000, limit: 20, message: 'Quant tools are limited to 20 runs per minute.',
        keyGenerator: (req) => `quant:${req.user.id}`,
    });

    app.use('/api/auth', authRouter({ env, db, requireAuth: auth, authLimiter }));
    app.use('/api/market', auth, marketRouter({ market }));
    app.use('/api/watchlist', auth, watchlistRouter({ db, market }));
    app.use('/api/portfolio', auth, portfolioRouter({ db, market }));
    app.use('/api/alerts', auth, alertsRouter({ db, market, logger, alertCheckLimiter }));
    app.use('/api/quant', auth, quantRouter({ db, market, quantLimiter }));
    app.use('/api/coach', auth, coachRouter({ coach: createCoach({ env, db, market }), quantLimiter }));
    app.use('/api', notFoundHandler);

    // Optionally serve the built frontend from the same origin (single-container deploys).
    if (staticDir && fs.existsSync(path.join(staticDir, 'index.html'))) {
        app.use(express.static(staticDir, { index: false, maxAge: '1y', immutable: true }));
        app.get(/^(?!\/api\/).*/, (_req, res) => {
            res.set('Cache-Control', 'no-cache');
            res.sendFile(path.join(staticDir, 'index.html'));
        });
    }

    app.use(errorHandler);
    return app;
}

module.exports = { createApp };
