'use strict';

const express = require('express');
const morgan = require('morgan');
const { config } = require('./config');
const { applySecurityMiddleware } = require('./middleware/security');
const { requestId, errorHandler } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const walletRoutes = require('./routes/wallet');
const servicesRoutes = require('./routes/services');
const verifyRoutes = require('./routes/verify');

function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  applySecurityMiddleware(app);
  app.use(requestId);

  // Limit JSON body size to reduce DoS via large payloads
  app.use(express.json({ limit: '32kb' }));

  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan(':method :url :status :res[content-length] - :response-time ms rid=:req[x-request-id]'));
  }

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'govconnect-usa-backend',
      storage: config.storageDriver,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/v1', (_req, res) => {
    res.json({
      name: 'GovConnect USA API',
      version: '0.1.0',
      endpoints: {
        auth: '/api/v1/auth',
        wallet: '/api/v1/wallet',
        documentRequests: '/api/v1/document-requests',
        vehicles: '/api/v1/vehicles',
        services: '/api/v1/services',
        verify: '/api/v1/verify/:code',
      },
    });
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/wallet', walletRoutes);
  app.use('/api/v1/document-requests', require('./routes/documentRequests'));
  app.use('/api/v1/vehicles', require('./routes/vehicles'));
  app.use('/api/v1/services', servicesRoutes);
  app.use('/api/v1/verify', verifyRoutes);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
  });

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
