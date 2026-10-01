'use strict';

const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const govServices = require('../services/govServices');

const router = express.Router();

router.get('/catalog', (_req, res) => {
  res.json({ services: govServices.listCatalog() });
});

router.use(requireAuth);

router.get('/requests', async (req, res, next) => {
  try {
    res.json({ requests: await govServices.listRequests(req.user.id) });
  } catch (err) {
    next(err);
  }
});

router.get('/requests/:requestId', async (req, res, next) => {
  try {
    res.json({ request: await govServices.getRequest(req.user.id, req.params.requestId) });
  } catch (err) {
    next(err);
  }
});

const submitSchema = z.object({
  serviceId: z.string().min(1),
  payload: z.record(z.unknown()).optional().default({}),
});

router.post('/requests', async (req, res, next) => {
  try {
    const data = submitSchema.parse(req.body);
    const request = await govServices.submitRequest(req.user.id, data, {
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(201).json({ request });
  } catch (err) {
    if (err.name === 'ZodError') {
      err.status = 400;
      err.code = 'VALIDATION_ERROR';
      err.message = err.issues.map((e) => e.message).join('; ');
    }
    next(err);
  }
});

module.exports = router;
