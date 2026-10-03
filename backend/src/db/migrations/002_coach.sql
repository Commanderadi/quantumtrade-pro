-- Coach: paper trading with a trade journal, a "mirror" benchmark and behaviour insights.
-- Practice money only; nothing here touches real holdings.

CREATE TABLE IF NOT EXISTS paper_accounts (
    user_id BIGINT UNSIGNED PRIMARY KEY,
    base_currency CHAR(3) NOT NULL DEFAULT 'INR',
    starting_cash DECIMAL(28, 8) NOT NULL,
    cash DECIMAL(28, 8) NOT NULL,
    -- Mirror portfolio: the same cash flows invested in the benchmark instead.
    benchmark_symbol VARCHAR(32) NOT NULL,
    mirror_units DECIMAL(28, 8) NOT NULL DEFAULT 0,
    mirror_cash DECIMAL(28, 8) NOT NULL,
    mirror_complete TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_paper_account_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS paper_trades (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    symbol VARCHAR(32) NOT NULL,
    asset_type ENUM('stock', 'crypto') NOT NULL,
    side ENUM('buy', 'sell') NOT NULL,
    quantity DECIMAL(28, 8) NOT NULL,
    -- Execution price in the instrument's own currency, and the rate used to convert it.
    price DECIMAL(28, 8) NOT NULL,
    price_currency CHAR(3) NOT NULL,
    fx_rate DECIMAL(28, 8) NOT NULL,
    -- Amounts below are in the account's base currency.
    gross_amount DECIMAL(28, 8) NOT NULL,
    fee DECIMAL(28, 8) NOT NULL,
    realized_pnl DECIMAL(28, 8) NULL,
    cash_after DECIMAL(28, 8) NOT NULL,
    reason ENUM('research', 'chart', 'news', 'tip', 'gut', 'rebalance', 'take_profit', 'stop_loss', 'other') NOT NULL,
    confidence TINYINT UNSIGNED NULL,
    note VARCHAR(500) NULL,
    -- Market context at the moment of the trade (used by the behaviour checks).
    day_change_pct DECIMAL(12, 4) NULL,
    benchmark_price DECIMAL(28, 8) NULL,
    executed_at DATETIME NOT NULL,
    KEY idx_paper_trades_user (user_id, executed_at, id),
    CONSTRAINT fk_paper_trade_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT chk_paper_trade_qty CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Each buy opens a lot; sells close lots first-in-first-out, so profit can be traced
-- back to the reason the user gave when buying.
CREATE TABLE IF NOT EXISTS paper_lots (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    buy_trade_id BIGINT UNSIGNED NOT NULL,
    symbol VARCHAR(32) NOT NULL,
    asset_type ENUM('stock', 'crypto') NOT NULL,
    quantity DECIMAL(28, 8) NOT NULL,
    quantity_open DECIMAL(28, 8) NOT NULL,
    -- Cost per unit in base currency, including the buy fee.
    unit_cost DECIMAL(28, 8) NOT NULL,
    reason VARCHAR(20) NOT NULL,
    opened_at DATETIME NOT NULL,
    closed_at DATETIME NULL,
    realized_pnl DECIMAL(28, 8) NOT NULL DEFAULT 0,
    KEY idx_paper_lots_open (user_id, asset_type, symbol, quantity_open),
    CONSTRAINT fk_paper_lot_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_paper_lot_trade FOREIGN KEY (buy_trade_id) REFERENCES paper_trades (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
