'use strict';

const pino = require('pino');

function createLogger(env) {
    return pino({
        level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
        redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
        ...(env.NODE_ENV === 'development' && { transport: { target: 'pino-pretty' } }),
    });
}

module.exports = { createLogger };
