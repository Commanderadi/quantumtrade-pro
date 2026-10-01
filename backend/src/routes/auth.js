'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { COOKIE_NAME, signSession, sessionCookieOptions } = require('../middleware/auth');
const { conflict, unauthorized } = require('../utils/httpError');

const BCRYPT_ROUNDS = 12;

const password = z.string().min(8, 'Password must be at least 8 characters').max(128);
const registerSchema = z.object({
    username: z.string().trim().regex(/^[a-zA-Z0-9_]{3,30}$/, 'Username must be 3-30 letters, digits or underscores'),
    email: z.string().trim().toLowerCase().email().max(255),
    password,
});
const loginSchema = z.object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(1).max(128),
});
const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password });
const deleteAccountSchema = z.object({ password: z.string().min(1).max(128) });

const publicUser = (u) => ({ id: Number(u.id), username: u.username, email: u.email, createdAt: u.createdAt ?? u.created_at });

function authRouter({ env, db, requireAuth, authLimiter }) {
    const router = express.Router();
    // Used when the email is unknown so login takes the same time either way.
    const dummyHash = bcrypt.hashSync('timing-equaliser', BCRYPT_ROUNDS);

    const startSession = (res, user) => {
        res.cookie(COOKIE_NAME, signSession(env, user), sessionCookieOptions(env));
    };

    router.post('/register', authLimiter, validate({ body: registerSchema }), async (req, res) => {
        const { username, email, password: plain } = req.valid.body;
        const hash = await bcrypt.hash(plain, BCRYPT_ROUNDS);
        let result;
        try {
            [result] = await db.execute('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', [username, email, hash]);
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') throw conflict('Username or email is already registered');
            throw err;
        }
        const user = { id: result.insertId, username, email, token_version: 0, createdAt: new Date() };
        startSession(res, user);
        res.status(201).json({ user: publicUser(user) });
    });

    router.post('/login', authLimiter, validate({ body: loginSchema }), async (req, res) => {
        const { email, password: plain } = req.valid.body;
        const [rows] = await db.execute(
            'SELECT id, username, email, password_hash, token_version, created_at FROM users WHERE email = ?',
            [email]
        );
        const user = rows[0];
        const ok = await bcrypt.compare(plain, user ? user.password_hash : dummyHash);
        if (!user || !ok) throw unauthorized('Invalid email or password');
        startSession(res, user);
        res.json({ user: publicUser(user) });
    });

    router.post('/logout', (_req, res) => {
        const { maxAge: _ignored, ...opts } = sessionCookieOptions(env);
        res.clearCookie(COOKIE_NAME, opts);
        res.status(204).end();
    });

    router.get('/me', requireAuth, (req, res) => {
        res.json({ user: publicUser(req.user) });
    });

    // Revokes every existing session for this user (including the current one).
    router.post('/logout-all', requireAuth, async (req, res) => {
        await db.execute('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [req.user.id]);
        const { maxAge: _ignored, ...opts } = sessionCookieOptions(env);
        res.clearCookie(COOKIE_NAME, opts);
        res.status(204).end();
    });

    router.post('/password', authLimiter, requireAuth, validate({ body: changePasswordSchema }), async (req, res) => {
        const { currentPassword, newPassword } = req.valid.body;
        const [[row]] = await db.execute('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
        if (!(await bcrypt.compare(currentPassword, row.password_hash))) throw unauthorized('Current password is incorrect');
        const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
        await db.execute('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [hash, req.user.id]);
        const [[updated]] = await db.execute('SELECT id, username, email, token_version, created_at FROM users WHERE id = ?', [req.user.id]);
        // Other sessions are revoked; keep this one signed in with a fresh token.
        startSession(res, updated);
        res.json({ user: publicUser(updated) });
    });

    router.delete('/me', authLimiter, requireAuth, validate({ body: deleteAccountSchema }), async (req, res) => {
        const [[row]] = await db.execute('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
        if (!(await bcrypt.compare(req.valid.body.password, row.password_hash))) throw unauthorized('Password is incorrect');
        await db.execute('DELETE FROM users WHERE id = ?', [req.user.id]);
        const { maxAge: _ignored, ...opts } = sessionCookieOptions(env);
        res.clearCookie(COOKIE_NAME, opts);
        res.status(204).end();
    });

    return router;
}

module.exports = { authRouter };
