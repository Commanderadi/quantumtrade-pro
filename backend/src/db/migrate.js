'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const LOCK_NAME = 'quantumtrade_migrations';

/**
 * Applies every pending `NNN_name.sql` file in ./migrations, in order, and
 * records it in `schema_migrations`. A MySQL named lock prevents two app
 * instances from migrating at the same time.
 */
async function migrate(env, logger = console) {
    const conn = await mysql.createConnection({
        host: env.DB_HOST,
        port: env.DB_PORT,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        database: env.DB_NAME,
        multipleStatements: true,
    });
    try {
        const [[{ locked }]] = await conn.query('SELECT GET_LOCK(?, 60) AS locked', [LOCK_NAME]);
        if (locked !== 1) throw new Error('Could not acquire migration lock');

        await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
            name VARCHAR(255) PRIMARY KEY,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB`);

        const [rows] = await conn.query('SELECT name FROM schema_migrations');
        const applied = new Set(rows.map((r) => r.name));
        const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();

        const appliedNow = [];
        for (const file of files) {
            if (applied.has(file)) continue;
            const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
            logger.info({ migration: file }, 'Applying migration');
            // MySQL DDL auto-commits, so each file should be idempotent-safe on its own.
            await conn.query(sql);
            await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
            appliedNow.push(file);
        }
        return appliedNow;
    } finally {
        await conn.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => {});
        await conn.end();
    }
}

module.exports = { migrate };

if (require.main === module) {
    const { loadEnv } = require('../config/env');
    migrate(loadEnv())
        .then((applied) => {
            console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date');
        })
        .catch((err) => {
            console.error(err.message);
            process.exit(1);
        });
}
