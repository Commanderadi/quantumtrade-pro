'use strict';

const { HttpError } = require('../utils/httpError');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Session cookies are SameSite=Lax; on top of that every state-changing request
 * must carry a custom header. Browsers can't add custom headers to cross-site
 * requests without a CORS preflight, which our CORS policy rejects.
 */
function requireCsrfHeader(req, _res, next) {
    if (SAFE_METHODS.has(req.method)) return next();
    if (req.get('x-requested-with') === 'XMLHttpRequest') return next();
    if (req.get('authorization')?.startsWith('Bearer ')) return next(); // non-browser API client
    next(new HttpError(403, 'Missing X-Requested-With header'));
}

module.exports = { requireCsrfHeader };
