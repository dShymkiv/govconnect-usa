'use strict';

const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const documentRequestService = require('../services/documentRequestService');
const authService = require('../services/authService');
const { findById } = require('../repositories/store');

const router = express.Router();

router.use(requireAuth);

router.get('/catalog', async (req, res, next) => {
  try {
    const stored = await findById('users', req.user.id);
    const profile = stored
      ? {
          isStudent: stored.isStudent === true,
          firstName: stored.firstName,
          lastName: stored.lastName,
          state: stored.state,
        }
      : null;
    res.json({ catalog: documentRequestService.listCatalog(profile) });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    res.json({ requests: await documentRequestService.listRequests(req.user.id) });
  } catch (err) {
    next(err);
  }
});

router.get('/:requestId', async (req, res, next) => {
  try {
    res.json({ request: await documentRequestService.getRequest(req.user.id, req.params.requestId) });
  } catch (err) {
    next(err);
  }
});

const submitSchema = z.object({
  requestTypeId: z.string().min(1),
  payload: z.record(z.unknown()).optional().default({}),
});

router.post('/', async (req, res, next) => {
  try {
    const data = submitSchema.parse(req.body);
    const user = await authService.getProfile(req.user.id);
    const stored = await findById('users', req.user.id);
    const profile = {
      ...user,
      isStudent: stored?.isStudent === true,
    };
    const request = await documentRequestService.submitRequest(req.user.id, profile, data, {
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
