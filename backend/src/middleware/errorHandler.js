'use strict';

const { HttpError } = require('../utils/httpError');

function notFoundHandler(req, _res, next) {
    next(new HttpError(404, `Route not found: ${req.method} ${req.path}`));
}

function errorHandler(err, req, res, _next) {
    if (err.type === 'entity.parse.failed') err = new HttpError(400, 'Malformed JSON body');
    if (err.type === 'entity.too.large') err = new HttpError(413, 'Request body too large');

    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) {
        req.log?.error({ err }, 'Request failed');
    }
    const body = { error: status >= 500 && !(err instanceof HttpError) ? 'Internal server error' : err.message };
    if (err.details) body.details = err.details;
    if (err.retryAfter) res.set('Retry-After', String(err.retryAfter));
    res.status(status).json(body);
}

module.exports = { notFoundHandler, errorHandler };
