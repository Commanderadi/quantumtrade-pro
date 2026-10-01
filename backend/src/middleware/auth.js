'use strict';

const jwt = require('jsonwebtoken');
const { unauthorized } = require('../utils/httpError');

const COOKIE_NAME = 'qt_session';

function readToken(req) {
    const header = req.get('authorization');
    if (header && header.startsWith('Bearer ')) return header.slice(7);
    return req.cookies?.[COOKIE_NAME];
}

/**
 * Verifies the session token and confirms the user still exists and the token
 * has not been revoked (token_version bumps on password change / logout-all).
 */
function requireAuth({ env, db }) {
    return async (req, _res, next) => {
        const token = readToken(req);
        if (!token) return next(unauthorized());
        let payload;
        try {
            payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
        } catch {
            return next(unauthorized('Session expired or invalid'));
        }
        const [rows] = await db.execute(
            'SELECT id, username, email, token_version, created_at FROM users WHERE id = ?',
            [payload.sub]
        );
        const user = rows[0];
        if (!user || user.token_version !== payload.tv) return next(unauthorized('Session expired or invalid'));
        req.user = { id: Number(user.id), username: user.username, email: user.email, createdAt: user.created_at };
        next();
    };
}

function signSession(env, user) {
    return jwt.sign({ sub: String(user.id), tv: user.token_version }, env.JWT_SECRET, {
        algorithm: 'HS256',
        expiresIn: env.SESSION_TTL_HOURS * 3600,
    });
}

function sessionCookieOptions(env) {
    return {
        httpOnly: true,
        secure: env.COOKIE_SECURE,
        sameSite: 'lax',
        path: '/api',
        maxAge: env.SESSION_TTL_HOURS * 3600 * 1000,
    };
}

module.exports = { COOKIE_NAME, requireAuth, signSession, sessionCookieOptions };
