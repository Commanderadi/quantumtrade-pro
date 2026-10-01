'use strict';

const mysql = require('mysql2/promise');

function createPool(env) {
    return mysql.createPool({
        host: env.DB_HOST,
        port: env.DB_PORT,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        database: env.DB_NAME,
        connectionLimit: env.DB_CONNECTION_LIMIT,
        waitForConnections: true,
        queueLimit: 0,
        // Keep DECIMAL columns as strings so no precision is lost in transit.
        decimalNumbers: false,
        supportBigNumbers: true,
        bigNumberStrings: true,
        dateStrings: false,
        timezone: 'Z',
        enableKeepAlive: true,
    });
}

/** Run `fn(conn)` inside a transaction, committing on success and rolling back on error. */
async function withTransaction(pool, fn) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const result = await fn(conn);
        await conn.commit();
        return result;
    } catch (err) {
        await conn.rollback().catch(() => {});
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = { createPool, withTransaction };
