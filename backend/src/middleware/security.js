'use strict';

const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { config } = require('../config');

function applySecurityMiddleware(app) {
  // Hide Express fingerprint
  app.disable('x-powered-by');

  // Security headers (CSP tuned for API — no HTML assets served here)
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'no-referrer' },
      hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    })
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Allow non-browser clients (curl, Postman) with no Origin
        if (!origin) return callback(null, true);
        if (config.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('CORS origin not allowed'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      maxAge: 600,
    })
  );

  // Global rate limit
  app.use(
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests', code: 'RATE_LIMITED' },
    })
  );
}

const authRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts', code: 'AUTH_RATE_LIMITED' },
});

module.exports = { applySecurityMiddleware, authRateLimiter };
