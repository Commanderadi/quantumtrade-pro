-- QuantumTrade Pro: initial schema.
-- Monetary values and quantities use DECIMAL(28,8) so crypto prices such as
-- 0.00001234 and fractional quantities are stored exactly.

CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(30) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    -- Incremented on password change / "log out everywhere" to revoke issued tokens.
    token_version INT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_username (username),
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS watchlist_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    symbol VARCHAR(32) NOT NULL,
    asset_type ENUM('stock', 'crypto') NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_watchlist (user_id, asset_type, symbol),
    CONSTRAINT fk_watchlist_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every trade the user records. Holdings are derived from this table.
CREATE TABLE IF NOT EXISTS transactions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    symbol VARCHAR(32) NOT NULL,
    asset_type ENUM('stock', 'crypto') NOT NULL,
    side ENUM('buy', 'sell') NOT NULL,
    quantity DECIMAL(28, 8) NOT NULL,
    price DECIMAL(28, 8) NOT NULL,
    fee DECIMAL(28, 8) NOT NULL DEFAULT 0,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    -- Filled in for sells: proceeds minus cost basis minus fee.
    realized_pnl DECIMAL(28, 8) NULL,
    note VARCHAR(255) NULL,
    executed_at DATETIME NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_tx_user_asset (user_id, asset_type, symbol, executed_at, id),
    CONSTRAINT fk_tx_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT chk_tx_quantity CHECK (quantity > 0),
    CONSTRAINT chk_tx_price CHECK (price >= 0),
    CONSTRAINT chk_tx_fee CHECK (fee >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Current position per asset, rebuilt from `transactions` on every write.
CREATE TABLE IF NOT EXISTS holdings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    symbol VARCHAR(32) NOT NULL,
    asset_type ENUM('stock', 'crypto') NOT NULL,
    quantity DECIMAL(28, 8) NOT NULL,
    average_cost DECIMAL(28, 8) NOT NULL,
    currency CHAR(3) NOT NULL,
    realized_pnl DECIMAL(28, 8) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_holding (user_id, asset_type, symbol),
    CONSTRAINT fk_holding_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS alerts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    symbol VARCHAR(32) NOT NULL,
    asset_type ENUM('stock', 'crypto') NOT NULL,
    `condition` ENUM('price_above', 'price_below', 'change_pct_above', 'change_pct_below') NOT NULL,
    target_value DECIMAL(28, 8) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    triggered_at DATETIME NULL,
    triggered_value DECIMAL(28, 8) NULL,
    last_checked_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_alerts_user (user_id, created_at),
    KEY idx_alerts_active (is_active, asset_type, symbol),
    CONSTRAINT fk_alert_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
