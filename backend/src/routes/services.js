'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const govServices = require('../services/govServices');
const {
  z,
  uuid,
  serviceCategory,
  serviceId,
  safePayload,
  parseOrThrow,
  zodToHttpError,
} = require('../security/validation');

const router = express.Router();

router.get('/catalog', (req, res, next) => {
  try {
    const category = parseOrThrow(serviceCategory, req.query.category || undefined);
    res.json({ services: govServices.listCatalog(category) });
  } catch (err) {
    next(err);
  }
});

router.use(requireAuth);

router.get('/requests', async (req, res, next) => {
  try {
    const category = parseOrThrow(serviceCategory, req.query.category || undefined);
    res.json({ requests: await govServices.listRequests(req.user.id, category) });
  } catch (err) {
    next(err);
  }
});

router.get('/requests/:requestId', async (req, res, next) => {
  try {
    const requestId = parseOrThrow(uuid, req.params.requestId);
    res.json({ request: await govServices.getRequest(req.user.id, requestId) });
  } catch (err) {
    next(err);
  }
});

const submitSchema = z.object({
  serviceId,
  payload: safePayload,
});

router.post('/requests', async (req, res, next) => {
  try {
    const data = parseOrThrow(submitSchema, req.body);
    const request = await govServices.submitRequest(req.user.id, data, {
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(201).json({ request });
  } catch (err) {
    next(zodToHttpError(err));
  }
});

module.exports = router;
