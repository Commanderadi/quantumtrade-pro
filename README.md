# QuantumTrade Pro

Track stocks and cryptocurrencies, record your trades, see live portfolio
performance, run technical analysis and get price alerts — in one self-hosted
web app.

- **Portfolio tracking** – record buys and sells (with fees and trade dates). Holdings, average cost, realized and unrealized P&L are computed from your trade ledger using exact decimal arithmetic. Totals are kept separate per currency (e.g. USD and INR are never summed).
- **Watchlist** – live quotes for stocks and crypto.
- **Technical analysis** – SMA 20/50, RSI 14, MACD (12, 26, 9), Bollinger Bands (20, 2), ATR 14 and volume computed from real daily price history, plus a rule-based signal summary.
- **Price alerts** – price above/below or daily % change, evaluated in the background against live quotes.
- **Accounts** – secure sign-up/sign-in, password change, “sign out everywhere”, and account deletion.
- **Light and dark themes**, responsive layout for phones.

> Information only — not investment advice. Quotes may be delayed depending on your data provider.

## Architecture

```
frontend/   React 18 + Vite SPA (react-router, recharts)
backend/    Node.js 22 + Express 5 REST API, MySQL 8
  src/
    app.js              express app (security headers, rate limits, routes)
    server.js           startup, migrations, graceful shutdown
    config/env.js       validated configuration
    db/                 connection pool + SQL migrations
    routes/             auth, market, watchlist, portfolio, alerts
    services/           market data providers, indicators, portfolio maths, alerts
    jobs/               background alert scheduler
  test/                 unit tests + integration tests against MySQL
Dockerfile              single image: API + built frontend
docker-compose.yml      app + MySQL
```

In production the API also serves the built frontend, so the browser talks to a
single origin and the session cookie never needs to cross sites.

### Market data providers

| Asset  | Quotes                                    | History / search | Key |
| ------ | ----------------------------------------- | ---------------- | --- |
| Stocks | [Finnhub](https://finnhub.io) if configured, otherwise [Alpha Vantage](https://www.alphavantage.co) | Alpha Vantage | `FINNHUB_API_KEY`, `ALPHA_VANTAGE_API_KEY` |
| Crypto | [CoinGecko](https://www.coingecko.com/en/api) | CoinGecko | optional `COINGECKO_API_KEY` |

Responses are cached in memory (quotes 60 s, daily history 6 h, search 24 h) and
concurrent identical requests are merged. When a provider is unavailable or rate
limited the API returns a clear `502`/`503` error — it never substitutes made-up prices.

**Free-tier limits matter:** Alpha Vantage's free key allows 25 requests per day,
which is only enough for light personal use. Add a free Finnhub key for stock
quotes, or use a paid Alpha Vantage plan. Exchange suffixes such as
`RELIANCE.BSE` work for non-US listings (Alpha Vantage), and the listing currency
is inferred from the suffix.

## Quick start (Docker)

```bash
cp .env.example .env
# edit .env: set DB_PASSWORD, DB_ROOT_PASSWORD, JWT_SECRET and your API keys
docker compose up --build
```

Open http://localhost:8080 and create an account. Database migrations run
automatically on start.

## Local development

Requirements: Node.js 22 (see `.nvmrc`) and MySQL 8.

```bash
# 1. Database
mysql -u root -p -e "CREATE DATABASE quantumtrade; CREATE USER 'quantumtrade'@'localhost' IDENTIFIED BY 'change-me'; GRANT ALL ON quantumtrade.* TO 'quantumtrade'@'localhost';"

# 2. API (http://localhost:5000)
cd backend
cp env.example .env        # set DB_* values, JWT_SECRET and API keys
npm install
npm run dev                # migrates the database, restarts on changes

# 3. Web app (http://localhost:3000, proxies /api to the backend)
cd ../frontend
npm install
npm run dev
```

## Configuration

All backend settings are environment variables, validated at start-up
(the server refuses to start with an invalid configuration). See
[`backend/env.example`](backend/env.example) for the full list. The important ones:

| Variable | Required | Description |
| --- | --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | yes | MySQL connection |
| `JWT_SECRET` | yes | ≥ 32 random characters used to sign session tokens |
| `SESSION_TTL_HOURS` | no | Session lifetime (default 168 = 7 days) |
| `COOKIE_SECURE` | no | Send cookies and HSTS only over HTTPS. Defaults to `true` in production |
| `TRUST_PROXY` | no | Number of reverse proxies in front of the app (for client IPs in rate limiting) |
| `CORS_ORIGINS` | no | Only if the frontend is hosted on a different origin |
| `ALPHA_VANTAGE_API_KEY`, `FINNHUB_API_KEY`, `COINGECKO_API_KEY` | see above | Market data |
| `ALERT_CHECK_INTERVAL_SECONDS` | no | Alert evaluation interval (default 300, `0` disables) |
| `MIGRATE_ON_START` | no | Set `false` to run `npm run migrate` as a separate deploy step |
| `STATIC_DIR` | no | Directory of the built frontend to serve (set automatically in Docker) |

The frontend needs no configuration when served by the API. To host it
separately, build with `VITE_API_URL=https://api.example.com` and set
`CORS_ORIGINS` on the API.

## Security

- Passwords hashed with bcrypt (cost 12). Login takes the same time whether or not the email exists.
- Sessions are signed JWTs in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` over HTTPS); no tokens in `localStorage`. Changing your password or “sign out everywhere” revokes all existing sessions.
- State-changing requests require an `X-Requested-With` header (CSRF defence in addition to SameSite cookies).
- Strict input validation on every endpoint (zod); parameterised SQL only.
- Helmet security headers including a Content Security Policy; HSTS when served over HTTPS.
- Rate limits: 300 requests/min per IP overall, 20 auth attempts per 15 min per IP.
- Every query is scoped to the signed-in user; the integration tests check that users can't read or change each other's data.
- Portfolio writes are serialised per user inside a database transaction, so concurrent requests cannot oversell.

## API overview

All endpoints are under `/api` and return JSON. Errors look like
`{ "error": "message", "details": [{ "field": "...", "message": "..." }] }`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health`, `/health/ready` | Liveness / readiness (checks the DB) |
| `POST` | `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/logout-all` | Session management |
| `GET` `DELETE` | `/auth/me` | Current user / delete account |
| `POST` | `/auth/password` | Change password |
| `GET` | `/market/quote/:assetType/:symbol` | Latest quote (`assetType` = `stock` or `crypto`) |
| `GET` | `/market/search?assetType=&q=` | Symbol search |
| `GET` | `/market/analysis/:assetType/:symbol` | Daily candles + indicators + signal summary |
| `GET` | `/market/crypto/top?limit=` | Top cryptocurrencies by market cap |
| `GET` | `/market/crypto/:symbol/info` | Coin details |
| `GET` `POST` | `/watchlist` | List (with quotes) / add |
| `DELETE` | `/watchlist/:assetType/:symbol` | Remove |
| `GET` | `/portfolio` | Valued positions and per-currency totals |
| `GET` `POST` | `/portfolio/transactions` | Trade history (paginated) / record a trade |
| `DELETE` | `/portfolio/transactions/:id` | Delete a trade (holdings are recomputed) |
| `GET` `POST` | `/alerts` | List / create |
| `PATCH` `DELETE` | `/alerts/:id` | Update, pause/re-arm / delete |
| `POST` | `/alerts/check` | Evaluate your alerts now |

Everything except `/health` and the register, login and logout endpoints
requires a session.

## Testing

```bash
cd backend
npm run lint
npm run test:unit                                    # no database needed
TEST_DB_USER=root TEST_DB_PASSWORD=secret npm test   # unit + integration (drops/creates `quantumtrade_test`)

cd ../frontend
npm run lint
npm test
npm run build
```

CI (`.github/workflows/ci.yml`) runs all of the above against a MySQL service,
audits production dependencies and builds the Docker image.

## Going to production — checklist

- [ ] Serve over HTTPS (load balancer or reverse proxy). Keep `COOKIE_SECURE` at its production default of `true`, and set `TRUST_PROXY` to the number of proxies in front of the app.
- [ ] Use a strong random `JWT_SECRET` and database password, stored in your platform's secret manager.
- [ ] Use a managed MySQL 8 instance with automated backups.
- [ ] Use market data plans whose rate limits match your number of users.
- [ ] Ship the JSON logs from stdout to your log platform, and monitor `/api/health/ready`.
- [ ] **Running more than one instance?** Rate limits and the market data cache are in memory, per instance. Move them to a shared store (e.g. Redis) when scaling out. Alert checks and migrations already use MySQL locks, so they are safe across instances.

## Upgrading from v1

v2 is a rewrite with a new schema (`users`, `holdings`, `transactions`,
`watchlist_items`, `alerts`) and a new default database name (`quantumtrade`).
Point it at a **new, empty database**; the old `stock_crypto_db` schema is not
migrated automatically. The old JWT-in-`localStorage` sessions are not
compatible, so users need to sign in again.

## Known limitations

- Price alerts appear in the app (dashboard banner and Alerts page). Email and push notifications are not implemented yet.
- Crypto prices are in USD only. Stock prices are in their listing currency, and there is no FX conversion between currencies.
- CoinGecko's free daily history only has closing prices, so crypto ATR measures close-to-close movement.
