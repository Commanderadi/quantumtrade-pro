-- Create the database if it doesn't already exist
CREATE DATABASE IF NOT EXISTS stock_crypto_db;

-- Switch to the new database to work inside it
USE stock_crypto_db;

-- -----------------------------------------------------
-- Table `Users`
-- Stores user information for authentication.
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS Users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL, -- This will store a secure, hashed password
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- -----------------------------------------------------
-- Table `watchlists`
-- Stores the stock symbols each user is watching.
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS watchlists (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    stock_symbol VARCHAR(10) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- This creates a link between this table and the Users table.
    -- If a user is deleted, all their watchlist items are also deleted (ON DELETE CASCADE).
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    
    -- This ensures a user cannot add the same stock symbol to their watchlist more than once.
    UNIQUE KEY (user_id, stock_symbol)
);

-- -----------------------------------------------------
-- Table `portfolios`
-- Stores user portfolio holdings
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    type ENUM('stock', 'crypto') NOT NULL DEFAULT 'stock',
    quantity DECIMAL(15,8) NOT NULL,
    average_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
    UNIQUE KEY (user_id, symbol, type)
);

-- -----------------------------------------------------
-- Table `transactions`
-- Stores all buy/sell transactions
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    type ENUM('stock', 'crypto') NOT NULL DEFAULT 'stock',
    transaction_type ENUM('buy', 'sell') NOT NULL,
    quantity DECIMAL(15,8) NOT NULL,
    price_per_unit DECIMAL(10,2) NOT NULL,
    total_amount DECIMAL(15,2) NOT NULL,
    transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

-- -----------------------------------------------------
-- Table `alerts`
-- Stores price alerts for users
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS alerts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    type ENUM('stock', 'crypto') NOT NULL DEFAULT 'stock',
    alert_type ENUM('price_above', 'price_below', 'percent_change') NOT NULL,
    target_value DECIMAL(15,2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);