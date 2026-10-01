'use strict';

const { uuidv4 } = require('../utils/ids');
const { verifyAccessToken } = require('../security/tokens');
const { audit } = require('../security/audit');

function requestId(req, res, next) {
  const id = req.headers['x-request-id'] || uuidv4();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    audit({
      action: 'AUTH_MISSING_TOKEN',
      outcome: 'denied',
      ip: req.ip,
      requestId: req.requestId,
    });
    return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' });
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      aal: decoded.aal,
      ial: decoded.ial,
    };
    return next();
  } catch (err) {
    audit({
      action: 'AUTH_INVALID_TOKEN',
      outcome: 'denied',
      ip: req.ip,
      requestId: req.requestId,
      meta: { reason: err.name },
    });
    return res.status(401).json({ error: 'Invalid or expired token', code: 'UNAUTHORIZED' });
  }
}

function errorHandler(err, req, res, _next) {
  // CORS errors from cors package
  if (err && err.message === 'CORS origin not allowed') {
    return res.status(403).json({ error: 'Origin not allowed', code: 'CORS_DENIED' });
  }

  const status = err.status || err.statusCode || 500;
  const code = err.code || (status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR');

  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error(`[${req.requestId}]`, err);
  }

  // Never leak stack traces or internal details to clients
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message || 'Request failed',
    code,
    requestId: req.requestId,
  });
}

module.exports = { requestId, requireAuth, errorHandler };
