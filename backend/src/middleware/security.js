'use strict';

const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { config } = require('../config');

function isPrivateLanOrigin(origin) {
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    const parts = hostname.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
    // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    if (parts[0] === 10) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    return false;
  } catch {
    return false;
  }
}

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
        // Local demos: phone on same Wi‑Fi opens UI via LAN IP (QR scan)
        if (!config.isProd && isPrivateLanOrigin(origin)) return callback(null, true);
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
