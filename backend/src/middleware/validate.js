'use strict';

const { ZodError } = require('zod');
const { HttpError } = require('../utils/httpError');

/**
 * Validates request parts against zod schemas and exposes the parsed values
 * on `req.valid` (Express 5 makes `req.query` read-only, so we don't overwrite it).
 */
function validate(schemas) {
    return (req, _res, next) => {
        try {
            req.valid = req.valid || {};
            for (const part of ['params', 'query', 'body']) {
                if (schemas[part]) req.valid[part] = schemas[part].parse(req[part] ?? {});
            }
            next();
        } catch (err) {
            if (err instanceof ZodError) {
                const details = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
                return next(new HttpError(400, 'Validation failed', details));
            }
            next(err);
        }
    };
}

module.exports = { validate };
